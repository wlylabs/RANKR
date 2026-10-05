"use client";

import clsx from "clsx";
import { useState, type CSSProperties, type ReactNode } from "react";

// The Swap page's cinema: the pool's curve (x·y = k) behind the page's top and under a quote, the quote's age as
// a ring, and the receipt a filled swap ends on. Decoration is hidden from screen readers and never catches
// clicks; with reduced motion everything stands still (globals.css).

/** A hyperbola y = 1/x from `u0` to `u1`, mapped into a `w` × `h` box (inset by `pad`), as an SVG path. */
function curvePath(u0: number, u1: number, w: number, h: number, pad: number, steps = 48) {
  const v0 = 1 / u1;
  const v1 = 1 / u0;
  const x = (u: number) => pad + ((u - u0) / (u1 - u0)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - v0) / (v1 - v0)) * (h - 2 * pad);
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    // Denser where the curve bends.
    const u = u0 * Math.pow(u1 / u0, i / steps);
    return `${x(u).toFixed(1)} ${y(1 / u).toFixed(1)}`;
  });
  return { d: `M ${pts.join(" L ")}`, x, y };
}

const FIELD_W = 400;
const FIELD_H = 104;
const FIELD = curvePath(0.3, 3.4, FIELD_W, FIELD_H, 14);

const frame =
  "field-in pointer-events-none absolute -top-16 -bottom-10 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden";

/**
 * Swap: the constant-product curve every pool trades on, drawn in behind the page's top, with a dot riding down
 * it once and settling at the bend, the way each swap moves a pool along it. The header must be
 * `relative isolate`.
 */
export function PoolField() {
  return (
    <div aria-hidden className={`${frame} [mask-image:radial-gradient(ellipse_75%_95%_at_70%_45%,#000_30%,transparent_100%)]`}>
      <div
        className="absolute inset-0 [background-image:radial-gradient(circle,var(--border-strong)_1px,transparent_1.3px)]"
        style={{ backgroundSize: "26px 26px", backgroundPosition: "50% 0" }}
      />
      {/* Beside the swap column on wide screens; behind the title's right on a phone. */}
      <div className="absolute -top-6 right-[-190px] sm:top-1 sm:right-auto sm:left-[calc(50%+250px)]" style={{ width: FIELD_W, height: FIELD_H }}>
        <svg width={FIELD_W} height={FIELD_H} className="absolute inset-0 overflow-visible">
          <path d={`M 14 ${FIELD_H - 14} H ${FIELD_W - 14} M 14 ${FIELD_H - 14} V 6`} className="stroke-border" strokeWidth={1} fill="none" />
          <path d={FIELD.d} pathLength={1} className="curve-draw stroke-subtle" strokeWidth={1.5} fill="none" />
          <text x={FIELD_W - 14} y={FIELD_H - 22} textAnchor="end" className="fill-subtle font-mono text-[10px]">
            x · y = k
          </text>
        </svg>
        <span
          className="curve-ride absolute top-0 left-0 size-2 rounded-full bg-up shadow-[0_0_14px_3px_color-mix(in_srgb,var(--up)_45%,transparent)]"
          style={{ offsetPath: `path('${FIELD.d}')`, offsetAnchor: "50% 50%" } as CSSProperties}
        />
      </div>
    </div>
  );
}

const CURVE_W = 400;
const CURVE_H = 64;
const U0 = 0.45;
const U1 = 2.2;
const CURVE = curvePath(U0, U1, CURVE_W, CURVE_H, 8);

/**
 * Where a swap takes the pool on its curve: the quote side's reserve goes from 1 (now) to 1 + impact on a buy
 * (the pool takes the money in), 1 - impact on a sell (it pays it out), the token side the other way, so their
 * product stays put. The longer the arc, the worse the price. Past the drawn range, it stops at the edge.
 */
export function PoolCurve({ side, impact }: { side: "buy" | "sell"; impact: number }) {
  const to = Math.min(U1, Math.max(U0, side === "buy" ? 1 + impact : 1 - Math.min(impact, 1)));
  const lo = Math.min(1, to);
  const hi = Math.max(1, to);
  const sx = (u: number) => CURVE.x(u);
  const sy = (u: number) => CURVE.y(1 / u);
  const arcD =
    hi - lo < 1e-6
      ? ""
      : `M ${Array.from({ length: 25 }, (_, i) => {
          const u = lo * Math.pow(hi / lo, i / 24);
          return `${sx(u).toFixed(1)} ${sy(u).toFixed(1)}`;
        }).join(" L ")}`;
  return (
    <figure className="px-1">
      <svg viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} className="block h-auto w-full overflow-visible" aria-hidden>
        <path d={CURVE.d} className="stroke-subtle" strokeWidth={1} strokeDasharray="2 3" fill="none" />
        {arcD && <path d={arcD} className={side === "buy" ? "stroke-up" : "stroke-down"} strokeWidth={2.5} strokeLinecap="round" fill="none" />}
        <circle cx={sx(1)} cy={sy(1)} r={3} className="fill-bg stroke-fg" strokeWidth={1.5} />
        <g style={{ transform: `translate(${sx(to)}px, ${sy(to)}px)`, transition: "transform 0.5s var(--ease-emphasized)" }}>
          <circle r={4} className={side === "buy" ? "fill-up" : "fill-down"} />
        </g>
      </svg>
      <figcaption className="mt-0.5 flex justify-between font-mono text-[10px] text-subtle">
        <span>pool now ○</span>
        <span>● after your swap · x · y = k</span>
      </figcaption>
    </figure>
  );
}

/**
 * The route a swap takes, from what you pay to what you get through the pool, with a dot running it once for
 * each new quote (key it on the quote). Decoration: the route is said in words next to it.
 */
export function RouteLine({ from, to, via }: { from: string; to: string; via: string }) {
  return (
    <div aria-hidden className="flex items-center gap-1.5 text-[11px]">
      <span className="shrink-0 text-muted">{from}</span>
      <span className="relative h-px min-w-3 flex-1 [background-image:linear-gradient(90deg,var(--border-strong)_50%,transparent_0)] [background-size:4px_1px]">
        <span className="route-run absolute top-1/2 size-1 -translate-y-1/2 rounded-full bg-fg" />
      </span>
      <span className="max-w-[60%] shrink truncate rounded border border-border px-1.5 py-px text-muted">{via}</span>
      <span className="relative h-px min-w-3 flex-1 [background-image:linear-gradient(90deg,var(--border-strong)_50%,transparent_0)] [background-size:4px_1px]">
        <span className="route-run absolute top-1/2 size-1 -translate-y-1/2 rounded-full bg-fg [animation-delay:0.45s]" />
      </span>
      <span className="shrink-0 text-muted">{to}</span>
    </div>
  );
}

/** How old the quote is: a ring that empties over `seconds`, restarted by each new quote (key it on one). */
export function QuoteRing({ at, seconds = 15, className }: { at: number; seconds?: number; className?: string }) {
  // Started where the quote's age already is, so a quote read a while ago doesn't show as brand new.
  const [age] = useState(() => Math.max(0, Date.now() - at));
  return (
    <svg viewBox="0 0 16 16" className={clsx("size-3.5 -rotate-90 motion-reduce:hidden", className)} aria-hidden>
      <circle cx={8} cy={8} r={6} className="stroke-border" strokeWidth={2} fill="none" />
      <circle
        cx={8}
        cy={8}
        r={6}
        pathLength={1}
        className="quote-ring stroke-muted"
        strokeWidth={2}
        fill="none"
        style={{ "--t": `${seconds}s`, "--d": `-${Math.min(age, seconds * 1000)}ms` } as CSSProperties}
      />
    </svg>
  );
}

const DIGITS = "0123456789";

/**
 * A number that rolls to its new value, digit by digit, each in its own column ("≈ 2.6M", "$44.57"): what a live
 * estimate does as it moves. Columns are counted from the right, so "999" to "1,000" keeps the digits lined up;
 * everything but digits just changes. Screen readers get the text. Key it on what was typed, so it only rolls
 * when a new quote moves it, not under your fingers.
 */
export function RollingNumber({ text, className }: { text: string; className?: string }) {
  const chars = [...text];
  return (
    <span className={clsx("inline-flex leading-none", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((ch, i) => {
          const key = chars.length - i;
          const d = DIGITS.indexOf(ch);
          if (d < 0) return <span key={`c${key}:${ch}`}>{ch === " " ? "\u00a0" : ch}</span>;
          return (
            <span key={`d${key}`} className="odo">
              <span className="odo-col" style={{ transform: `translateY(${-d}em)` }}>
                {[...DIGITS].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** A check drawing itself in a circle, with a spark going off it. */
function CheckMark() {
  return (
    <span className="relative mx-auto block size-11">
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="spark absolute top-1/2 left-1/2 -mt-px h-0.5 w-2.5 rounded-full bg-up"
          style={{ "--a": `${i * 45}deg` } as CSSProperties}
        />
      ))}
      <CheckSvg />
    </span>
  );
}

function CheckSvg() {
  return (
    <svg viewBox="0 0 48 48" className="size-11" aria-hidden>
      <circle cx={24} cy={24} r={21} pathLength={1} className="check-draw stroke-up" strokeWidth={2} fill="none" />
      <path
        d="M15 24.5 L21.5 31 L33.5 18"
        pathLength={1}
        className="check-draw stroke-up"
        style={{ "--d": "380ms" } as CSSProperties}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * What a filled swap ends on: a receipt. The check draws itself, its lines come in one after another and a
 * FILLED · PAPER stamp comes down on it.
 */
export function Receipt({
  title,
  rows,
  note,
  children,
}: {
  title: string;
  rows: [string, ReactNode][];
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="ticket-print sweep relative mt-4 card p-5 [--sweep:var(--up)]">
      <CheckMark />
      <p className="cine-in mt-3 text-center font-medium" style={{ "--d": "250ms" } as CSSProperties}>
        {title}
      </p>
      <span
        aria-hidden
        className="stamp absolute top-4 right-4 rounded border-2 border-up/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.18em] text-up/90"
      >
        FILLED · PAPER
      </span>
      <dl className="mt-4 space-y-1.5 border-t border-dashed border-border pt-3 font-mono text-xs">
        {rows.map(([label, value], i) => (
          <div key={label} className="boot-line flex items-baseline justify-between gap-3" style={{ "--d": `${450 + i * 90}ms` } as CSSProperties}>
            <dt className="text-muted">{label}</dt>
            <dd className="tabular truncate text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-dashed border-border pt-3 text-center text-xs text-muted">{note}</p>
      {children}
    </div>
  );
}
