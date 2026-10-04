"use client";

import clsx from "clsx";
import { Check, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { parseAmount, spendPresets, useMoney } from "@/lib/currency";
import { formatAmount, formatMultiple, formatPrice, formatUsd } from "@/lib/format";
import { openPaperTrade } from "@/lib/paper";
import {
  CONFIRM_IMPACT,
  WARN_IMPACT,
  atMultiple,
  poolOf,
  quoteBuy,
  quoteSell,
  whatIf,
  type Quality,
} from "@/lib/sim";
import type { MarketSnapshot } from "@/lib/types";
import { RateNote } from "./RateNote";

/** An earlier price to measure "what if" from: the first paste, or your call. */
export type WhatIfEntry = { label: string; priceUsd: number; marketCap: number | null };

const QUALITY: Record<Quality, { label: string; title: string }> = {
  good: { label: "estimate", title: "A constant-product pool with known depth: the estimate should be close." },
  rough: {
    label: "rough estimate",
    title: "The pool's fee or depth is a guess (concentrated liquidity, or a DEX Rankr doesn't model): it could fill better or worse.",
  },
  none: { label: "price impact unknown", title: "DexScreener gives no liquidity for this pair: price impact isn't counted." },
};

/** Price moves to show a paper buy's exit at, "if the liquidity holds". */
const EXITS = [
  { k: 2, label: "2x" },
  { k: 5, label: "5x" },
  { k: 10, label: "10x" },
  { k: 0.5, label: "-50%" },
];

export const PAPER_NOTE =
  "Simulated with public DexScreener data: no real money, no wallet, nothing is traded. Fills are estimated from the pool's liquidity (x·y = k), the DEX's fee and network costs; real trades can fill worse (bots, MEV, token taxes, launch fees, failed transactions, liquidity pulls). Not financial advice.";

function pct(x: number) {
  return `${(x * 100).toFixed(x >= 0.1 ? 0 : 1)}%`;
}

/** "+3.2% impact"; from double the market price on, as a multiple of it: "1,723x the market price". */
function impactLabel(x: number) {
  return x >= 1 ? `${formatMultiple(1 + x)} the market price` : `+${pct(x)} impact`;
}

/**
 * What a paper buy of any amount would fill at right now, what it would bring in at a few price moves, what it
 * would be worth had it gone in at an earlier price, and a button to open it as a paper trade (kept on this
 * device, under You → Paper).
 */
export function SimulatePanel({ market: m, entries = [], className }: { market: MarketSnapshot; entries?: WhatIfEntry[]; className?: string }) {
  const money = useMoney();
  const presets = spendPresets(money.shown, money.rate?.usdIdr ?? null);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [bought, setBought] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const inputId = useId();

  const typedUsd = typed ? parseAmount(typed, money.shown, money.rate?.usdIdr ?? null) : null;
  const typedOk = typedUsd !== null;
  const spend = typed ? (typedOk ? typedUsd : null) : (picked ?? presets[0].usd);
  const fill = spend ? quoteBuy(m, spend) : null;
  const pool = poolOf(m);
  const big = !!fill && fill.impact >= CONFIRM_IMPACT;

  function changed() {
    setBought(false);
    setConfirming(false);
  }

  function buy() {
    if (!spend) return;
    if (big && !confirming) return setConfirming(true);
    if (openPaperTrade(m, spend, money.rate?.usdIdr ?? null)) {
      setBought(true);
      setConfirming(false);
    }
  }

  return (
    <section className={clsx("card", className)}>
      <h2 className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm font-medium">
        <span className="flex items-center gap-2">
          <FlaskConical className="size-3.5 text-muted" /> Simulate
        </span>
        <span className="rounded border border-border px-1.5 font-mono text-[10px] font-normal tracking-wide text-subtle uppercase">paper</span>
      </h2>
      <div className="space-y-4 p-4">
        <div>
          <div role="group" aria-label="Amount" className="grid grid-cols-4 gap-1">
            {presets.map((p) => {
              const on = !typed && (picked ?? presets[0].usd) === p.usd;
              return (
                <button
                  key={p.usd}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setPicked(p.usd);
                    setTyped("");
                    changed();
                  }}
                  className={clsx(
                    "h-8 truncate rounded-md border px-1 font-mono text-[11px] transition-colors",
                    on ? "border-fg bg-fg text-bg" : "border-border text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <label htmlFor={inputId} className="sr-only">
            Other amount
          </label>
          <input
            id={inputId}
            inputMode="decimal"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              changed();
            }}
            placeholder="Other amount, any size"
            className="mt-1.5 h-8 w-full rounded-md border border-border bg-transparent px-2.5 font-mono text-xs outline-none placeholder:text-subtle focus:border-border-strong"
          />
          {typed && !typedOk && <p className="mt-1 text-xs text-down">That isn&apos;t an amount.</p>}
        </div>

        {fill ? (
          <dl className="space-y-1.5 font-mono text-xs">
            <Row label="You'd get">
              ≈ {formatAmount(fill.tokens)} <span className="text-muted">${m.symbol}</span>
            </Row>
            <Row label="Fills at">
              {formatPrice(fill.fillPriceUsd)}{" "}
              <span
                className={clsx(fill.impact >= WARN_IMPACT ? "text-down" : fill.impact >= 0.01 ? "text-fg" : "text-muted")}
                title="Price impact: how far the buy moves the pool's price"
              >
                ({fill.quality === "none" ? "impact unknown" : impactLabel(fill.impact)})
              </span>
            </Row>
            <Row label="Costs">
              ≈ {money.format(fill.feeUsd + fill.networkUsd)}{" "}
              <span className="text-muted">
                · {(pool.fee * 100).toFixed(2).replace(/\.?0+$/, "")}% fee + network
              </span>
            </Row>
            <Row label="Estimate">
              <span title={QUALITY[fill.quality].title} className={fill.quality === "good" ? "text-muted" : "text-fg"}>
                {QUALITY[fill.quality].label}
                {fill.completesCurve && " · would finish the pump.fun curve"}
              </span>
            </Row>
          </dl>
        ) : (
          <p className="text-xs text-muted">
            {!(m.priceUsd > 0)
              ? "No live price to simulate with."
              : spend
                ? `Too small: network costs alone are about ${money.format(pool.networkUsd)}.`
                : "Pick an amount."}
          </p>
        )}

        {fill && fill.impact >= WARN_IMPACT && (
          <p className="rounded-md border border-down/40 px-2.5 py-2 text-xs text-down">
            {fill.impact >= 1
              ? `Fills at ${impactLabel(fill.impact)}: a trade this size would all but drain this pool. A smaller amount fills closer to the market price.`
              : `Large price impact (${pct(fill.impact)}): a trade this size moves this pool a lot. A smaller amount fills closer to the market price.`}
          </p>
        )}

        {fill && spend && (
          <div className="border-t border-border pt-3">
            <div className="label mb-1.5 text-subtle">If sold at</div>
            <div className="grid grid-cols-4 gap-1 text-center font-mono text-[11px]">
              {EXITS.map((e) => {
                const out = quoteSell(atMultiple(m, e.k), fill.tokens);
                return (
                  <div key={e.label} className="rounded-md bg-surface-2 px-1 py-1.5">
                    <div className="text-subtle">{e.label}</div>
                    <div className={clsx("tabular mt-0.5 truncate", out && out.proceedsUsd > spend ? "text-up" : "text-down")}>
                      {out ? money.format(out.proceedsUsd, { short: true }) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-subtle">After fees and price impact, if the pool&apos;s liquidity holds.</p>
          </div>
        )}

        {fill && spend && entries.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-3">
            {entries.map((e) => {
              const out = whatIf(m, spend, e.priceUsd);
              if (!out) return null;
              const gain = out.proceedsUsd / spend - 1;
              return (
                <div key={e.label} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-muted">
                    {money.format(spend)} at {e.label.toLowerCase()}
                    {e.marketCap !== null && <span className="font-mono text-subtle"> ({formatUsd(e.marketCap)} mc)</span>}
                  </span>
                  <span className="tabular shrink-0 text-right font-mono">
                    ≈ {money.format(out.proceedsUsd)}{" "}
                    <span className={gain > 0.005 ? "text-up" : gain < -0.005 ? "text-down" : "text-muted"}>
                      {gain >= 0 ? "+" : ""}
                      {(gain * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
              );
            })}
            <p className="text-[11px] text-subtle">If sold now, after fees and today&apos;s price impact.</p>
          </div>
        )}

        <div>
          {bought ? (
            <p className="flex h-9 items-center gap-2 text-sm">
              <Check className="size-4 text-up" /> Bought on paper.{" "}
              <Link href="/me?tab=paper" className="text-muted underline-offset-4 hover:text-fg hover:underline">
                Your paper trades
              </Link>
            </p>
          ) : (
            <button
              type="button"
              onClick={buy}
              disabled={!fill}
              className={clsx(
                "inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium hover:opacity-85 disabled:opacity-40",
                confirming ? "border border-down text-down" : "bg-fg text-bg",
              )}
            >
              {confirming
                ? `Paper buy anyway, at ${fill && fill.impact >= 1 ? impactLabel(fill.impact) : `${pct(fill?.impact ?? 0)} impact`}`
                : `Paper buy${spend ? ` ${money.format(spend)}` : ""}`}
            </button>
          )}
          <RateNote className="mt-2" />
          <p className="mt-2 text-[11px] leading-relaxed text-subtle">{PAPER_NOTE}</p>
        </div>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 font-sans text-muted">{label}</dt>
      <dd className="tabular min-w-0 text-right">{children}</dd>
    </div>
  );
}
