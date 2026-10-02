"use client";

import clsx from "clsx";
import { ArrowUpRight, ChevronDown, ChevronUp, Crosshair } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatAmount, formatDate, formatUsd, shortAddress } from "@/lib/format";
import { explorerAddress, explorerTx, traceHref, type TraceChain } from "@/lib/trace/chains";
import type { TreeItem } from "@/lib/trace/tree";
import type { TraceResponse } from "@/lib/trace/types";
import { Avatar } from "../Avatar";
import { CopyButton } from "../CopyButton";
import { TimeAgo } from "../TimeAgo";
import { LabelTag } from "./TraceCard";

const linkClass =
  "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-fg";

type InspectorProps = {
  chain: TraceChain;
  item: TreeItem;
  /** The wallet it hangs from (none for the target). */
  parent: string | null;
  /** Its own read, once opened (the target's always). */
  data: TraceResponse | undefined;
  onToggle: () => void;
  /** Without its card frame (inside the fullscreen panel). */
  bare?: boolean;
};

/** The card picked on the tree, in full: whole address, label and source, what moved, links out. */
export function Inspector({ chain, item, parent, data, onToggle, bare }: InspectorProps) {
  const address = item.address!;
  const flow = item.flow;
  const label = item.type === "root" ? (data?.label ?? null) : (flow?.label ?? null);
  return (
    <section className={bare ? "p-4" : "card p-4 sm:p-5"} aria-label="Selected wallet">
      <div className="flex items-center gap-2">
        <span className="label text-fg">{item.type === "root" ? "Target" : "Selected"}</span>
        {parent && flow && (
          <span className="label truncate text-subtle">
            {item.side === "out" ? `received from ${shortAddress(parent)}` : `sent to ${shortAddress(parent)}`}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-start gap-3">
        <Avatar userId={address} size={36} className="rounded-[8px]" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[13px] leading-snug break-all">{address}</p>
          <div className="mt-1 flex items-center gap-3">
            <CopyButton value={address} label="Copy" />
            {label && <span className="text-[12px] text-subtle">via {label.source}</span>}
          </div>
        </div>
      </div>
      {label && <LabelTag label={label} className="mt-3 text-sm" />}
      {item.loop && (
        <p className="mt-3 text-sm text-muted">
          ↺ This wallet is already higher up on this trail: the money went round.
        </p>
      )}

      {flow && (
        <div className="mt-4 rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {flow.assets.map((a) => (
              <li
                key={a.symbol}
                className="tabular flex items-baseline justify-between gap-3 px-3 py-2 font-mono text-[13px]"
              >
                <span>
                  {formatAmount(a.amount)} {a.symbol}
                </span>
                <span className="text-muted">{formatUsd(a.usd)}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-3 py-2 text-[12px] text-muted">
            {flow.txs} {flow.txs === 1 ? "transaction" : "transactions"}
            {flow.txs > 1 ? (
              <>
                , {formatDate(flow.first)} → <TimeAgo at={flow.last} />
              </>
            ) : (
              <>, {formatDate(flow.last)}</>
            )}
          </p>
        </div>
      )}

      {data && (
        <p className="mt-3 text-[12px] text-muted">
          {data.balance && (
            <>
              Holds {formatAmount(data.balance.amount)} {data.balance.symbol}
              {data.balance.usd !== null && <> ({formatUsd(data.balance.usd)})</>}.{" "}
            </>
          )}
          {data.firstSeen && (
            <>
              First seen <TimeAgo at={data.firstSeen} />.
            </>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {item.expandable && (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center rounded-md bg-fg px-3 py-1.5 text-[13px] font-medium text-bg hover:opacity-85"
          >
            {item.expanded ? "Close" : item.side === "out" ? "Open: where it went" : "Open: who funded it"}
          </button>
        )}
        {item.type !== "root" && (
          <Link href={traceHref(chain.id, address)} className={linkClass}>
            <Crosshair className="size-3.5" /> Trace from here
          </Link>
        )}
        {flow && (
          <a href={explorerTx(chain, flow.tx)} target="_blank" rel="noreferrer" className={linkClass}>
            Latest tx <ArrowUpRight className="size-3.5" />
          </a>
        )}
        <a href={explorerAddress(chain, address)} target="_blank" rel="noreferrer" className={linkClass}>
          Explorer <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </section>
  );
}

/**
 * The picked card along the bottom of the fullscreen tree: one line (who it is, what moved, open or close it),
 * pulled up for the whole Inspector. Small, so the tree stays in view above it.
 */
export function InspectorStrip(props: InspectorProps) {
  const [more, setMore] = useState(false);
  const { item, data } = props;
  const flow = item.flow;
  const label = item.type === "root" ? (data?.label ?? null) : (flow?.label ?? null);
  const top = flow?.assets[0];
  return (
    <div className="border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] shadow-float backdrop-blur-md">
      {more && (
        <div className="max-h-[55dvh] overflow-y-auto overscroll-contain border-b border-border">
          <Inspector {...props} bare />
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Avatar userId={item.address!} size={28} className="rounded-[6px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px]">{shortAddress(item.address!)}</p>
          <div className="truncate text-[12px] text-muted">
            {label ? (
              <LabelTag label={label} />
            ) : top ? (
              `${formatAmount(top.amount)} ${top.symbol}${flow?.usd != null ? ` · ${formatUsd(flow.usd)}` : ""}`
            ) : item.type === "root" ? (
              "Target"
            ) : (
              "Wallet"
            )}
          </div>
        </div>
        {item.expandable && (
          <button
            type="button"
            onClick={props.onToggle}
            className="shrink-0 rounded-md bg-fg px-3 py-1.5 text-[13px] font-medium text-bg hover:opacity-85"
          >
            {item.expanded ? "Close" : "Open"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className={clsx(
            "inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[13px] text-muted hover:text-fg",
            more && "border-border-strong text-fg",
          )}
        >
          Details {more ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
