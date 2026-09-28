"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { callSpread, recentForm } from "@/lib/caller-stats";
import { formatMultiple, tokenHref } from "@/lib/format";
import type { Row } from "./MyCalls";
import { TimeAgo } from "./TimeAgo";

// Marks carry the direction (down / neither / up, see --chart-* in globals.css); text stays in text colors.
const FILL = { down: "bg-chart-down", mid: "bg-chart-mid", up: "bg-chart-up" } as const;
const HIT =
  "rounded outline-none focus-visible:ring-1 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

function Card({ title, readout, children }: { title: string; readout: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="label text-subtle">{title}</h2>
      {/* The hovered or focused mark's numbers, else the summary. */}
      <p aria-live="polite" className="mt-1 min-h-4 truncate font-mono text-xs text-muted">
        {readout}
      </p>
      {children}
    </section>
  );
}

/** How the calls are doing right now: how many are below entry, under 2x, and at 2x, 5x, 10x, 100x and up. */
export function CallSpread({ rows }: { rows: Row[] }) {
  const buckets = callSpread(rows.filter((r) => r.token).map((r) => r.multiple));
  const total = buckets.reduce((n, b) => n + b.count, 0);
  const hits = buckets.filter((b) => b.tone === "up").reduce((n, b) => n + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const [active, setActive] = useState<number | null>(null);
  const a = active === null ? null : buckets[active];
  const where = (b: (typeof buckets)[number]) => (b.key === "loss" ? "below entry" : `at ${b.label}`);

  return (
    <Card
      title="Calls now"
      readout={
        a ? (
          <>
            <span className="text-fg">{a.count}</span> {a.count === 1 ? "call" : "calls"} {where(a)} ·{" "}
            {Math.round((a.count / Math.max(total, 1)) * 100)}%
          </>
        ) : (
          <>
            <span className="text-fg">{hits}</span> of {total} at 2x+
          </>
        )
      }
    >
      <div className="mt-3 grid grid-cols-6 gap-0.5" onPointerLeave={() => setActive(null)}>
        {buckets.map((b, i) => (
          <button
            key={b.key}
            type="button"
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            aria-label={`${b.count} ${b.count === 1 ? "call" : "calls"} ${where(b)}`}
            className={clsx("flex flex-col items-center", HIT)}
          >
            <span className={clsx("tabular font-mono text-[11px]", b.count ? "text-muted" : "text-subtle")}>{b.count}</span>
            <span className="relative mt-1 flex h-16 w-full items-end justify-center after:absolute after:-inset-x-px after:bottom-0 after:h-px after:bg-border">
              {b.count > 0 && (
                <span
                  className={clsx(
                    "w-full max-w-6 rounded-t-[4px] transition-opacity",
                    FILL[b.tone],
                    active !== null && active !== i && "opacity-40",
                  )}
                  style={{ height: `${Math.max(6, (b.count / max) * 100)}%` }}
                />
              )}
            </span>
            <span className="mt-1.5 font-mono text-[10px] whitespace-nowrap text-subtle">{b.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

const FORM = 10;

/**
 * The last 10 calls, oldest to newest, each a bar up or down from its entry (log scale), with how many are up
 * and the streak of calls in profit up to the newest.
 */
export function RecentForm({ rows }: { rows: Row[] }) {
  const form = recentForm(
    rows.filter((r) => r.token),
    FORM,
  );
  const bars = [...form.recent].reverse();
  // Log scale, the same both ways: 2x up is as tall as -50% down. At least 2x, so small moves look small.
  const scale = Math.max(Math.log10(2), ...bars.map((r) => Math.abs(Math.log10(Math.max(r.multiple, 1e-6)))));
  const [active, setActive] = useState<number | null>(null);
  const a = active === null ? null : bars[active];

  return (
    <Card
      title={`Last ${FORM} calls`}
      readout={
        a ? (
          <>
            <span className="text-fg">${a.symbol}</span> {formatMultiple(a.multiple)} · called <TimeAgo at={a.calledAt} />
          </>
        ) : (
          <>
            <span className="text-fg">{form.up}</span>/{bars.length} up · {form.hits} at 2x+
            {form.streak > 1 && (
              <>
                {" "}
                · <span className="text-fg">{form.streak}</span> up in a row
              </>
            )}
          </>
        )
      }
    >
      <div
        className="relative mt-3 grid h-[5.5rem] grid-cols-10 gap-0.5 before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-border"
        onPointerLeave={() => setActive(null)}
      >
        {/* Newest at the right edge, however many calls there are. */}
        {Array.from({ length: FORM - bars.length }, (_, i) => (
          <span key={`empty${i}`} />
        ))}
        {bars.map((r, i) => {
          const tone = r.multiple > 1.005 ? "up" : r.multiple < 0.995 ? "down" : "mid";
          const h = `${Math.max(6, Math.min(1, Math.abs(Math.log10(Math.max(r.multiple, 1e-6))) / scale) * 100)}%`;
          const dim = active !== null && active !== i && "opacity-40";
          return (
            <Link
              key={r.id}
              href={tokenHref(r)}
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`$${r.symbol}: ${formatMultiple(r.multiple)}`}
              className={clsx("relative flex flex-col items-center", HIT)}
            >
              <span className="flex h-1/2 w-full items-end justify-center">
                {tone === "up" && <span className={clsx("w-full max-w-6 rounded-t-[4px] bg-chart-up transition-opacity", dim)} style={{ height: h }} />}
              </span>
              <span className="flex h-1/2 w-full items-start justify-center">
                {tone === "down" && (
                  <span className={clsx("w-full max-w-6 rounded-b-[4px] bg-chart-down transition-opacity", dim)} style={{ height: h }} />
                )}
              </span>
              {tone === "mid" && (
                <span className={clsx("absolute top-1/2 h-0.5 w-full max-w-6 -translate-y-1/2 bg-chart-mid transition-opacity", dim)} />
              )}
            </Link>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-subtle">
        <span>older</span>
        <span>newest</span>
      </div>
    </Card>
  );
}
