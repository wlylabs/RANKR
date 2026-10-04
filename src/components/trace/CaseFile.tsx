"use client";

import clsx from "clsx";
import { Flag, TriangleAlert } from "lucide-react";
import { formatAmount, formatDay, formatUsd } from "@/lib/format";
import { caseFile, holdingsText } from "@/lib/trace/case";
import type { TraceResponse } from "@/lib/trace/types";
import { TimeAgo } from "../TimeAgo";
import { FullAddress } from "./TraceCard";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border py-2.5 first:border-t-0 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="label pt-0.5 text-subtle">{k}</dt>
      <dd className="min-w-0 text-sm text-pretty">{children}</dd>
    </div>
  );
}

/**
 * What the trail says so far, in words: who the wallet is, who funded it, how much went each way, where it
 * ended up, and the flags it raises. It grows as the money is followed.
 */
export function CaseFile({
  root,
  data,
  caseId,
}: {
  root: TraceResponse;
  data: Map<string, TraceResponse>;
  caseId: string;
}) {
  const c = caseFile(root, data);
  const f = root.funder;
  const holds = holdingsText(root);
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="case-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="case-title" className="label text-fg">
          Case file
        </h2>
        <span className="font-mono text-[11px] text-subtle">#{caseId}</span>
      </div>

      {c.flags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {c.flags.map((flag) => (
            <li
              key={flag.id}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px]",
                flag.danger ? "border-down/40 bg-down-soft text-down" : "border-border text-muted",
              )}
            >
              {flag.danger ? <TriangleAlert className="size-3.5 shrink-0" /> : <Flag className="size-3 shrink-0" />}
              {flag.text}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-3">
        <Row k="Wallet">
          <FullAddress address={root.address} max={13} />
          {root.label && <>{root.label.name} · </>}
          {root.firstSeen && (
            <>
              first seen <TimeAgo at={root.firstSeen} />
            </>
          )}
          {holds && (
            <>
              {root.firstSeen && " · "}holds {holds}
            </>
          )}
        </Row>
        <Row k="Funded by">
          {f ? (
            <>
              <FullAddress address={f.address} max={13} />
              {f.label && <>{f.label.name}, </>}
              {formatAmount(f.assets[0]?.amount ?? 0)} {f.assets[0]?.symbol}, {formatDay(f.first)}
              {f.label && <span className="text-subtle"> ({f.label.source})</span>}
            </>
          ) : root.scanned.complete ? (
            <span className="text-muted">No incoming transfer in its history.</span>
          ) : (
            <span className="text-muted">Older than what was read; its first transfer in is further back.</span>
          )}
        </Row>
        <Row k="Money in">
          {formatUsd(c.inUsd)} from {c.senders} {c.senders === 1 ? "wallet" : "wallets"}
        </Row>
        <Row k="Money out">
          {formatUsd(c.outUsd)} to {c.receivers} {c.receivers === 1 ? "wallet" : "wallets"}
          {root.swaps && (
            <>
              ; {root.swaps.txs} {root.swaps.txs === 1 ? "trade" : "trades"}
              {root.swaps.usd !== null && <> ({formatUsd(root.swaps.usd)})</>}
            </>
          )}
        </Row>
        <Row k="Ended at">
          {c.exits.length ? (
            <ul className="space-y-1">
              {c.exits.slice(0, 5).map((e) => (
                <li key={e.address}>
                  {e.name}
                  <span className="text-subtle">
                    {" "}
                    · {e.hops === 1 ? "directly" : `${e.hops} hops`}
                    {e.usd !== null && <> · {formatUsd(e.usd)}</>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">
              No exchange, bridge or mixer yet. Follow the money further to see where it ends up.
            </span>
          )}
        </Row>
        <Row k="Read">
          <span className="text-muted">
            {root.scanned.complete ? "Its whole history" : `Its newest ${root.scanned.txs} transactions`}
            {root.scanned.from && root.scanned.to && (
              <>
                , {formatDay(root.scanned.from)} → {formatDay(root.scanned.to)}
              </>
            )}
            {root.scanned.limited &&
              (root.scanned.quota ? (
                <> (the Solana RPC&apos;s budget ran out, so the rest wasn&apos;t read: open it again later for more)</>
              ) : (
                <> (Solana&apos;s RPC was busy, so the rest wasn&apos;t read: open it again in a minute for more)</>
              ))}
            {!!root.scanned.skipped && <> ({root.scanned.skipped} the chain wouldn&apos;t return, left out)</>}. Amounts
            in dollars at today&apos;s prices.
          </span>
        </Row>
      </dl>

      <p className="mt-3 border-t border-border pt-3 text-[12px] leading-relaxed text-subtle">
        Names come from public lists (exchanges&apos; own reserve wallets, the OFAC sanctions list, Tether and Circle
        freezes, open-source label sets), each shown with its source. A label isn&apos;t an identity, and money passing
        through a wallet isn&apos;t proof of a crime.
      </p>
    </section>
  );
}
