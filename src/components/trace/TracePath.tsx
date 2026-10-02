"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, ChevronDown, Crosshair, RotateCcw, Split } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatAmount, formatDay, formatUsd } from "@/lib/format";
import { traceHref, type TraceChain } from "@/lib/trace/chains";
import { DANGER } from "@/lib/trace/kinds";
import { branches, type PathStep, type PathStop } from "@/lib/trace/path";
import { MAX_DEPTH, parentId, type Side, type TreeItem } from "@/lib/trace/tree";
import type { TraceFlow, TraceLabel, TraceResponse } from "@/lib/trace/types";
import { Avatar } from "../Avatar";
import { FullAddress, LabelTag, Scramble } from "./TraceCard";

type TracePathProps = {
  steps: PathStep[];
  /** Every wallet of the trail as read, by id (from useTrail). */
  items: Map<string, TreeItem>;
  /** The target's read (null while it's read). */
  root: TraceResponse | null;
  /** For "Trace from here" where the trail runs as deep as it goes (none for the made-up example). */
  chain?: TraceChain;
  selected?: string;
  /** A tap on a card (the page shows it in full below); without it, cards aren't buttons. */
  onSelect?: (item: TreeItem) => void;
  /** Go a hop further through a wallet: read it and open it. */
  onFollow: (item: TreeItem) => void;
  /** Take another wallet at a fork. */
  onPick: (item: TreeItem) => void;
  onRetry: (address: string) => void;
  /** Along the top of the frame. */
  header?: ReactNode;
  className?: string;
};

const ROLE: Record<Extract<PathStop, { type: "wallet" }>["role"], string> = {
  funded: "Funder",
  sent: "Sender",
  target: "Target",
  hop: "Hop",
  end: "End",
};

/** What an end of the trail is, in words. */
const END: Partial<Record<TraceLabel["kind"], string>> = {
  cex: "an exchange, where money is cashed out",
  bridge: "a bridge: the money left for another chain",
  mixer: "a mixer, built to break the trail",
  dex: "a DEX: the money was swapped for something else",
  contract: "a contract",
};

const danger = (label: TraceLabel | null | undefined) => !!label && DANGER.has(label.kind);
const stable = (f: TraceFlow) => f.assets.length === 1 && /^(USDC|USDT|DAI|PYUSD|USDe)$/.test(f.assets[0].symbol);

/**
 * The trail as one line, top to bottom, the way the tall share card draws it: who funded the target, the target,
 * and the wallets its money went through, a card each, with what moved on the arrow between them. The end of the
 * line goes a hop further (Follow), and every arrow from a wallet that paid more than one can take another (Switch).
 */
export function TracePath({
  steps,
  items,
  root,
  chain,
  selected,
  onSelect,
  onFollow,
  onPick,
  onRetry,
  header,
  className,
}: TracePathProps) {
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // The line grew (a wallet followed was read): its new end comes into view. Not when the target's own read
  // arrives and the line first appears.
  const ends = useRef<{ first: string; last: string } | null>(null);
  const first = id(steps[0]);
  const last = id(steps.at(-1));
  const ready = !!root;
  useLayoutEffect(() => {
    const was = ends.current;
    ends.current = ready ? { first, last } : null;
    if (!was || !ready) return;
    if (was.last !== last) bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    else if (was.first !== first) top.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [first, last, ready]);

  return (
    <div className={clsx("trace-grid overflow-hidden rounded-xl border border-border", className)}>
      {header && (
        <div className="flex h-11 items-center gap-2 border-b border-border bg-bg/85 px-4 backdrop-blur-sm">
          {header}
        </div>
      )}
      {!root ? (
        <div className="mx-auto max-w-md px-4 py-10" role="status">
          <div className="skeleton rounded-lg border border-border px-4 py-5 font-mono text-[13px] text-muted">
            <Scramble length={16} />
            <p className="label mt-1 text-subtle">Reading the chain…</p>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-md px-3 pt-5 pb-6 sm:px-4 sm:pt-7 sm:pb-8">
          <div ref={top} className="scroll-my-24">
            <TopEnd steps={steps} items={items} onFollow={onFollow} onPick={onPick} onRetry={onRetry} />
          </div>
          <ol aria-label="The trail, top to bottom">
            {steps.map((step, i) => {
              const stop = step.stop;
              if (stop.type !== "wallet") return null;
              const item = items.get(stop.id);
              const next = steps[i + 1]?.stop;
              return (
                <li key={stop.id} className="trace-stop">
                  <StopCard stop={stop} item={item} root={root} selected={selected === stop.id} onSelect={onSelect} />
                  {next?.type === "wallet" && step.down && (
                    <Arrow flow={step.down} {...fork(items, stop.id, next.id)} onPick={onPick} />
                  )}
                </li>
              );
            })}
          </ol>
          <div ref={bottom} className="scroll-my-24">
            <BottomEnd steps={steps} items={items} chain={chain} onFollow={onFollow} onRetry={onRetry} />
          </div>
        </div>
      )}
    </div>
  );
}

const id = (step: PathStep | undefined) => (step?.stop.type === "wallet" ? step.stop.id : "");

/**
 * The fork an arrow leaves from: below the target, the upper card paid the lower one (one of the wallets it paid);
 * above it, the upper card is one of the wallets that paid the lower one.
 */
function fork(items: Map<string, TreeItem>, upper: string, lower: string) {
  const below = parentId(lower) === upper;
  const parent = items.get(below ? upper : lower);
  const current = below ? lower : upper;
  const side: Side = below ? "out" : "in";
  return { parent, side, current, tone: items.get(current)?.flow?.label };
}

function StopCard({
  stop,
  item,
  root,
  selected,
  onSelect,
}: {
  stop: Extract<PathStop, { type: "wallet" }>;
  item: TreeItem | undefined;
  root: TraceResponse;
  selected: boolean;
  onSelect?: (item: TreeItem) => void;
}) {
  const target = stop.role === "target";
  const label = target ? root.label : stop.label;
  const bad = danger(label);
  const Tag = onSelect && item ? "button" : "div";
  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      onClick={Tag === "button" ? () => onSelect!(item!) : undefined}
      aria-pressed={Tag === "button" ? selected : undefined}
      className={clsx(
        "relative block w-full rounded-lg border px-3 py-2.5 text-left transition-[border-color,box-shadow]",
        target
          ? "border-fg bg-fg text-bg shadow-float"
          : clsx(
              "bg-surface",
              bad ? "border-down/60" : stop.role === "end" ? "border-border-strong" : "border-border",
              Tag === "button" && !bad && "hover:border-border-strong",
              item?.loop && "border-dashed",
            ),
        selected && "ring-1 ring-fg ring-offset-2 ring-offset-bg",
      )}
    >
      <span className={clsx("label flex items-center gap-2", target ? "text-bg/60" : "text-subtle")}>
        <Avatar
          userId={stop.address}
          size={20}
          className={clsx("shrink-0 rounded-[5px]", target && "bg-bg/15 text-bg")}
        />
        {stop.role === "hop" ? `${ROLE.hop} ${String(stop.hop).padStart(2, "0")}` : ROLE[stop.role]}
        {stop.role === "funded" && (
          <span
            className="rounded-[3px] border border-current px-1 font-mono text-[8.5px] leading-[14px] tracking-widest"
            title="Its first money came from here"
          >
            1ST
          </span>
        )}
        {item?.loop && <span className="normal-case">↺ already on this trail</span>}
      </span>
      {/* The whole address, on one line: no "…" to hide which wallet it is. */}
      <FullAddress address={stop.address} decrypt max={15} className="mt-1.5" />
      {label && <LabelTag label={label} className={clsx("mt-1 text-[12px]", target && "text-bg/80")} />}
      {target && root.balance && (
        <span className="tabular mt-1 block truncate font-mono text-[11.5px] text-bg/70">
          Holds {formatAmount(root.balance.amount)} {root.balance.symbol}
          {root.balance.usd !== null && <> · {formatUsd(root.balance.usd)}</>}
        </span>
      )}
    </Tag>
  );
}

/** The arrow between two cards: what moved down it, when, and the other ways the money went at this fork. */
function Arrow({
  flow,
  parent,
  side,
  current,
  tone,
  onPick,
}: {
  flow: TraceFlow;
  parent: TreeItem | undefined;
  side: Side;
  current: string;
  tone: TraceLabel | null | undefined;
  onPick: (item: TreeItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = parent ? branches(parent, side) : [];
  const at = options.findIndex((o) => o.id === current);
  const top = flow.assets[0];
  const bad = danger(tone);
  return (
    <div>
      <div className="flex min-h-[4.5rem]">
        <Line tone={bad ? "danger" : flow.terminal ? "end" : "plain"} />
        <div className="min-w-0 flex-1 py-3">
          <p className={clsx("tabular truncate font-mono text-[13px]", bad && "text-down")}>
            {top ? `${formatAmount(top.amount)} ${top.symbol}` : "—"}
            {flow.usd !== null && !stable(flow) && <span className="text-muted"> · {formatUsd(flow.usd)}</span>}
            {flow.assets.length > 1 && (
              <span className="text-subtle">
                {" "}
                + {flow.assets.length - 1} more {flow.assets.length === 2 ? "token" : "tokens"}
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted">
            {flow.txs} {flow.txs === 1 ? "transfer" : "transfers"} ·{" "}
            {flow.txs > 1 && formatDay(flow.first) !== formatDay(flow.last)
              ? `${formatDay(flow.first)} → ${formatDay(flow.last)}`
              : formatDay(flow.last)}
          </p>
          {options.length > 1 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1 text-[12px] text-muted transition-colors hover:border-border-strong hover:text-fg"
            >
              <Split className="size-3.5" />
              {at + 1} of {options.length} · Switch
              <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
      {open && parent && (
        <Choices
          className="mb-2"
          parent={parent}
          side={side}
          options={options}
          current={current}
          onPick={(item) => {
            setOpen(false);
            onPick(item);
          }}
        />
      )}
    </div>
  );
}

/** A line running down between two cards, with the money moving along it. */
function Line({ tone }: { tone: "danger" | "end" | "plain" | "faint" }) {
  return (
    <div
      aria-hidden
      className={clsx(
        "relative w-[52px] shrink-0",
        tone === "danger" ? "text-down" : tone === "faint" ? "text-border-strong" : "text-fg",
      )}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current opacity-25" />
      {tone !== "faint" && <span className="trace-flow absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2" />}
      <svg viewBox="0 0 10 6" className="absolute bottom-0.5 left-1/2 w-2.5 -translate-x-1/2">
        <path d="M0 0 5 6 10 0Z" fill="currentColor" />
      </svg>
    </div>
  );
}

/** The wallets at a fork, biggest first: tap one to take it instead. */
function Choices({
  parent,
  side,
  options,
  current,
  onPick,
  className,
}: {
  className?: string;
  parent: TreeItem;
  side: Side;
  options: TreeItem[];
  current?: string;
  onPick: (item: TreeItem) => void;
}) {
  const hidden = parent.children.find((c) => c.type === "more" && c.side === side)?.count ?? 0;
  return (
    <div
      className={clsx("animate-fade-in overflow-hidden rounded-lg border border-border bg-bg shadow-float", className)}
    >
      <p className="label border-b border-border px-3 py-2 text-subtle">
        {side === "out" ? "Where its money went" : "Who sent it money"} · biggest first
      </p>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto overscroll-contain">
        {options.map((o) => {
          const f = o.flow!;
          const on = o.id === current;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onPick(o)}
                aria-pressed={on}
                className={clsx(
                  "block w-full px-3 py-2 text-left transition-colors hover:bg-surface-2",
                  on && "bg-surface-2",
                )}
              >
                <FullAddress address={o.address!} max={12.5} />
                <span className="mt-1 flex items-center gap-2 text-[11.5px] text-muted">
                  <Avatar userId={o.address!} size={16} className="shrink-0 rounded-[4px]" />
                  {o.funder && (
                    <span className="shrink-0 rounded-[3px] border border-current px-1 font-mono text-[8.5px] leading-[14px] tracking-widest">
                      1ST
                    </span>
                  )}
                  {f.label && <LabelTag label={f.label} className="min-w-0" />}
                  <span className="tabular ml-auto shrink-0 font-mono text-[12px]">
                    {f.usd !== null
                      ? formatUsd(f.usd)
                      : `${formatAmount(f.assets[0]?.amount ?? 0)} ${f.assets[0]?.symbol ?? ""}`}
                  </span>
                  <Check className={clsx("size-3.5 shrink-0", on ? "text-fg" : "invisible")} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="border-t border-border px-3 py-2 text-[12px] text-subtle">+{hidden} smaller, not listed</p>
      )}
    </div>
  );
}

/** A wallet being read, or one that couldn't be, at an end of the line. */
function Reading({ item, what, onRetry }: { item: TreeItem; what: string; onRetry: (address: string) => void }) {
  const failed = item.children.find((c) => c.type === "error");
  if (failed) {
    return (
      <div className="rounded-lg border border-dashed border-down/50 px-3 py-2.5">
        <p className="text-[13px] text-down">{failed.error ?? "Couldn't read this wallet"}</p>
        <button
          type="button"
          onClick={() => onRetry(item.address!)}
          className="mt-1 inline-flex items-center gap-1 font-mono text-[12px] text-muted hover:text-fg"
        >
          <RotateCcw className="size-3" /> Try again
        </button>
      </div>
    );
  }
  return (
    <div
      className="skeleton rounded-lg border border-border px-3 py-2.5 font-mono text-[12.5px] text-muted"
      role="status"
    >
      <Scramble length={12} />
      <p className="label mt-0.5 text-subtle">{what}</p>
    </div>
  );
}

const Note = ({ children, danger: bad }: { children: ReactNode; danger?: boolean }) => (
  <p className={clsx("ml-[52px] text-[13px] text-pretty", bad ? "text-down" : "text-muted")}>{children}</p>
);

/** Above the first card: go further up (who sent it money), or pick a sender when nothing's above the target. */
function TopEnd({
  steps,
  items,
  onFollow,
  onPick,
  onRetry,
}: {
  steps: PathStep[];
  items: Map<string, TreeItem>;
  onFollow: (item: TreeItem) => void;
  onPick: (item: TreeItem) => void;
  onRetry: (address: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const first = steps[0]?.stop;
  if (first?.type !== "wallet") return null;
  const item = items.get(first.id);
  if (!item) return null;

  if (first.role === "target") {
    const senders = branches(item, "in");
    if (!senders.length) return null;
    return (
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border-strong bg-bg/80 px-3 py-2.5 text-left text-[13px] text-muted transition-colors hover:border-fg hover:text-fg"
        >
          <ArrowUp className="size-4 shrink-0" />
          <span className="flex-1">
            {senders.length} {senders.length === 1 ? "wallet" : "wallets"} sent it money. Pick one to follow up.
          </span>
          <ChevronDown className={clsx("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <Choices
            className="mt-2"
            parent={item}
            side="in"
            options={senders}
            onPick={(s) => {
              setOpen(false);
              onPick(s);
            }}
          />
        )}
      </div>
    );
  }

  const wrap = (node: ReactNode) => (
    <div className="mb-1">
      {node}
      <div className="flex h-6">
        <Line tone="faint" />
      </div>
    </div>
  );
  if (item.loop || item.flow?.terminal) return null;
  if (item.expanded) {
    if (item.children.some((c) => c.type === "pending" || c.type === "error"))
      return wrap(<Reading item={item} what="Reading who sent it money…" onRetry={onRetry} />);
    return null;
  }
  if (!item.expandable) return null;
  return wrap(
    <button
      type="button"
      onClick={() => onFollow(item)}
      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border-strong bg-bg/80 px-3 py-2.5 text-left text-[13px] text-muted transition-colors hover:border-fg hover:text-fg"
    >
      <ArrowUp className="size-4 shrink-0" />
      <span className="flex-1">Who sent this wallet its money? Follow it up</span>
    </button>,
  );
}

/** Below the last card: where the trail ends, or the button that takes it a hop further. */
function BottomEnd({
  steps,
  items,
  chain,
  onFollow,
  onRetry,
}: {
  steps: PathStep[];
  items: Map<string, TreeItem>;
  chain?: TraceChain;
  onFollow: (item: TreeItem) => void;
  onRetry: (address: string) => void;
}) {
  const last = steps.at(-1)?.stop;
  if (last?.type !== "wallet") return null;
  const item = items.get(last.id);
  if (!item) return null;
  const end = (node: ReactNode) => (
    <div className="mt-1">
      <div className="flex h-6">
        <Line tone="faint" />
      </div>
      {node}
    </div>
  );

  if (last.role === "target") {
    return end(<Note>Nothing went out of it, in what was read.</Note>);
  }
  const label = item.flow?.label;
  if (item.flow?.terminal) {
    return end(
      <Note danger={danger(label)}>
        End of the trail. {label?.name ?? "This address"} is {END[label?.kind ?? "contract"] ?? "an end"}.
      </Note>,
    );
  }
  if (item.loop) return end(<Note>↺ This wallet is already higher up on the trail: the money went round.</Note>);
  if (item.expanded) {
    if (item.children.some((c) => c.type === "pending" || c.type === "error"))
      return end(<Reading item={item} what="Reading where it went…" onRetry={onRetry} />);
    return end(<Note>Nothing went out of it, in what was read. The trail stops here for now.</Note>);
  }
  if (!item.expandable) {
    return end(
      <Note>
        {Math.abs(item.depth) >= MAX_DEPTH ? "As deep as one trail goes. " : ""}
        {chain && (
          <Link
            href={traceHref(chain.id, item.address!)}
            className="inline-flex items-center gap-1 font-medium text-fg underline-offset-2 hover:underline"
          >
            <Crosshair className="size-3.5" /> Trace from here
          </Link>
        )}
      </Note>,
    );
  }
  return end(
    <button
      type="button"
      onClick={() => onFollow(item)}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-fg px-4 py-3 text-sm font-medium text-bg shadow-float transition-opacity hover:opacity-90"
    >
      Follow the money <ArrowDown className="size-4" />
    </button>,
  );
}
