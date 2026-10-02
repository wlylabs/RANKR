"use client";

import clsx from "clsx";
import { Repeat, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import { DANGER } from "@/lib/trace/kinds";
import { NODE_H, NODE_W, type Placed } from "@/lib/trace/tree";
import type { TraceLabel, TraceResponse } from "@/lib/trace/types";
import { Avatar } from "../Avatar";
import { DecryptText } from "../DecryptText";

const KIND: Record<TraceLabel["kind"], string> = {
  cex: "CEX",
  bridge: "Bridge",
  mixer: "Mixer",
  dex: "DEX",
  contract: "Contract",
  sanctioned: "OFAC",
  hack: "Exploit",
  scam: "Scam",
  frozen: "Frozen",
  named: "Name",
};

/** A label as a mono tag and a name: "CEX Binance". Red when it means trouble. */
export function LabelTag({ label, className }: { label: TraceLabel; className?: string }) {
  const danger = DANGER.has(label.kind);
  return (
    <span className={clsx("flex min-w-0 items-center gap-1.5", className)}>
      <span
        className={clsx(
          "shrink-0 rounded-[3px] px-1 font-mono text-[9.5px] leading-[15px] tracking-wide uppercase",
          danger
            ? "bg-down text-bg"
            : label.kind === "cex"
              ? "bg-fg text-bg"
              : "border border-border-strong text-muted",
        )}
      >
        {KIND[label.kind]}
      </span>
      <span className={clsx("truncate", danger && "text-down")}>{label.name}</span>
    </span>
  );
}

const HEX = "0123456789abcdef";

/** Hex that keeps changing: a wallet being read. */
function Scramble({ length = 10 }: { length?: number }) {
  const [text, setText] = useState("0x" + "·".repeat(length));
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(
      () => setText("0x" + Array.from({ length }, () => HEX[Math.floor(Math.random() * 16)]).join("")),
      70,
    );
    return () => clearInterval(id);
  }, [length]);
  return <span aria-hidden>{text}</span>;
}

/** The joint where a card's next row hangs: + to open it, − to close it, END where the trail stops. */
function Joint({ placed, open }: { placed: Placed; open: boolean }) {
  const { item } = placed;
  const below = item.side === "out";
  const pos = below ? "-bottom-[9px]" : "-top-[9px]";
  if (item.flow?.terminal) {
    return (
      <span
        className={clsx(
          "absolute left-1/2 -translate-x-1/2 rounded-[3px] border border-border bg-bg px-1 font-mono text-[8.5px] leading-4 tracking-widest text-subtle",
          pos,
        )}
      >
        END
      </span>
    );
  }
  if (!item.expandable) return null;
  return (
    <span
      aria-hidden
      className={clsx(
        "absolute left-1/2 grid size-[18px] -translate-x-1/2 place-items-center rounded-full border font-mono text-[11px] leading-none transition-colors",
        open
          ? "border-fg bg-fg text-bg"
          : "border-border-strong bg-bg text-muted group-hover:border-fg group-hover:text-fg",
        pos,
      )}
    >
      {open ? "−" : "+"}
    </span>
  );
}

function FlowLine({ placed }: { placed: Placed }) {
  const f = placed.item.flow;
  if (!f) return null;
  const top = f.assets[0];
  // A stablecoin's amount is its dollar value already.
  const stable = f.assets.length === 1 && !!top && /^(USDC|USDT|DAI|PYUSD|USDe)$/.test(top.symbol);
  return (
    <span className="tabular block truncate font-mono text-[11px] text-muted">
      {top ? `${formatAmount(top.amount)} ${top.symbol}` : "—"}
      {f.usd !== null && !stable && <> · {formatUsd(f.usd)}</>}
      {f.txs > 1 && <span className="text-subtle"> ×{f.txs}</span>}
    </span>
  );
}

type CardProps = {
  placed: Placed;
  selected: boolean;
  root: TraceResponse | null;
  onPress: (placed: Placed) => void;
  onRetry: () => void;
};

/** One card on the tree, at its place (centered on placed.x, placed.y). */
export function TraceCard({ placed, selected, root, onPress, onRetry }: CardProps) {
  const { item } = placed;
  const style = {
    width: NODE_W,
    height: NODE_H,
    transform: `translate(${placed.x - NODE_W / 2}px, ${placed.y - NODE_H / 2}px)`,
  };
  const base = "trace-node absolute top-0 left-0 rounded-lg text-left";
  // Where it sits, and which card it is (the frame brings a card reached with Tab into view by it).
  const at = { style, "data-node": item.id };

  if (item.type === "pending") {
    return (
      <div
        {...at}
        className={clsx(base, "skeleton flex flex-col justify-center gap-1 border border-border px-3")}
        role="status"
      >
        <span className="font-mono text-[12px] text-muted">
          <Scramble />
        </span>
        <span className="label text-subtle">Reading chain…</span>
      </div>
    );
  }
  if (item.type === "error") {
    return (
      <div
        {...at}
        className={clsx(base, "flex flex-col justify-center gap-1 border border-dashed border-down/50 px-3")}
      >
        <span className="truncate text-[12px] text-down">{item.error ?? "Couldn't read this wallet"}</span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex w-fit items-center gap-1 font-mono text-[11px] text-muted hover:text-fg"
        >
          <RotateCcw className="size-3" /> Try again
        </button>
      </div>
    );
  }
  if (item.type === "swaps") {
    return (
      <div
        {...at}
        className={clsx(
          base,
          "flex flex-col justify-center gap-0.5 border border-dashed border-border-strong bg-bg/80 px-3",
        )}
      >
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          <Repeat className="size-3.5 text-muted" /> Swaps
        </span>
        <span className="tabular font-mono text-[11px] text-muted">
          {item.swaps!.txs} trades{item.swaps!.usd !== null && <> · {formatUsd(item.swaps!.usd)}</>}
        </span>
        <span className="label text-subtle">On DEXes, not followed</span>
      </div>
    );
  }
  if (item.type === "others") {
    return (
      <button
        type="button"
        {...at}
        onClick={() => onPress(placed)}
        className={clsx(
          base,
          "flex flex-col justify-center gap-0.5 border border-dashed border-border px-3 transition-colors hover:border-fg",
        )}
      >
        <span className="font-mono text-[13px]">
          +{item.count} {item.count === 1 ? "other" : "others"}
        </span>
        <span className="label text-subtle">Folded · tap to show</span>
      </button>
    );
  }
  if (item.type === "more") {
    const Tag = item.expandable ? "button" : "div";
    return (
      <Tag
        type={item.expandable ? "button" : undefined}
        {...at}
        onClick={item.expandable ? () => onPress(placed) : undefined}
        className={clsx(
          base,
          "flex flex-col justify-center gap-0.5 border border-dashed border-border px-3",
          item.expandable && "transition-colors hover:border-fg",
        )}
      >
        <span className="font-mono text-[13px]">+{item.count} more</span>
        <span className="label text-subtle">{item.expandable ? "Show all" : "Smaller, not shown"}</span>
      </Tag>
    );
  }

  const isRoot = item.type === "root";
  const label = isRoot ? (root?.label ?? null) : (item.flow?.label ?? null);
  const danger = !!label && DANGER.has(label.kind);
  const open = !!item.expanded;
  return (
    <button
      type="button"
      {...at}
      onClick={() => onPress(placed)}
      aria-expanded={item.expandable ? open : undefined}
      aria-label={`${label?.name ?? shortAddress(item.address!)}${item.expandable ? (open ? ", close" : ", open") : ""}`}
      className={clsx(
        base,
        "group flex flex-col justify-center gap-[3px] border px-3 transition-[border-color,box-shadow]",
        isRoot
          ? "border-fg bg-fg text-bg shadow-float"
          : clsx(
              "bg-surface",
              danger
                ? "border-down/60"
                : item.flow?.terminal
                  ? "border-border-strong"
                  : "border-border hover:border-border-strong",
              item.loop && "border-dashed",
            ),
        selected && "ring-1 ring-fg ring-offset-2 ring-offset-bg",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Avatar userId={item.address!} size={20} className={clsx("rounded-[5px]", isRoot && "bg-bg/15 text-bg")} />
        <DecryptText
          text={shortAddress(item.address!)}
          className="min-w-0 truncate font-mono text-[12.5px] tracking-tight"
          duration={700}
        />
        {item.funder && (
          <span
            className="ml-auto shrink-0 rounded-[3px] border border-current px-1 font-mono text-[8.5px] leading-[14px] tracking-widest text-muted"
            title="Its first money came from here"
          >
            1ST
          </span>
        )}
      </span>
      <span className={clsx("min-w-0 text-[12px]", isRoot ? "text-bg/70" : "text-muted")}>
        {label ? (
          <LabelTag label={label} />
        ) : item.loop ? (
          <span className="font-mono text-[11px]">↺ already on this trail</span>
        ) : (
          <span className="font-mono text-[11px] text-subtle">{isRoot ? "Target · holds" : "Wallet"}</span>
        )}
      </span>
      {isRoot ? (
        <span className="tabular truncate font-mono text-[11px] text-bg/70">
          {root?.balance ? `${formatAmount(root.balance.amount)} ${root.balance.symbol}` : <Scramble length={8} />}
          {root?.balance?.usd != null && <> · {formatUsd(root.balance.usd)}</>}
        </span>
      ) : (
        <FlowLine placed={placed} />
      )}
      {!isRoot && <Joint placed={placed} open={open} />}
    </button>
  );
}
