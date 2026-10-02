"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { RANKR_SHA256 } from "../Logo";
import { FullAddress, Scramble } from "./TraceCard";

// The Trace tab's cinema, in the app's own grammar (the landing's hash field, decrypting text, arrivals out of a
// blur): money dripping down a ledger behind the intro, and a case being opened while a wallet is read.

const CELL = 28;

// The columns money drips down, from the same digest as the logo: where (cells from the center), how long a
// drop takes, and when it starts.
const DRIPS = Array.from({ length: 10 }, (_, i) => {
  const h = parseInt(RANKR_SHA256.slice(i * 4, i * 4 + 4), 16);
  return { x: (h % 27) - 13, t: 3.2 + (h % 7) * 0.45, d: (h * 37) % 4200 };
}).filter((c, i, all) => all.findIndex((o) => o.x === c.x) === i);

/**
 * Behind the Trace intro: the dotted ledger the trail is drawn on, a few of its columns lit, a packet of light
 * falling down each now and then: money moving, hop by hop. Pure decoration: hidden from screen readers, never
 * catches clicks, still with reduced motion.
 */
export function TrailField() {
  return (
    <div
      aria-hidden
      className="field-in pointer-events-none absolute -top-12 bottom-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden [mask-image:radial-gradient(ellipse_70%_80%_at_50%_40%,#000_30%,transparent_100%)]"
    >
      <div
        className="absolute inset-0 [background-image:radial-gradient(circle,var(--border-strong)_1px,transparent_1.3px)]"
        style={{ backgroundSize: `${CELL}px ${CELL}px`, backgroundPosition: "50% 0" }}
      />
      {DRIPS.map(({ x, t, d }) => (
        <div key={x} className="absolute inset-y-0 w-px" style={{ left: `calc(50% + ${x * CELL}px)` }}>
          <span className="absolute inset-y-0 left-0 w-px bg-border/50" />
          <span
            className="trail-drip absolute top-0 -left-px h-20 w-[3px] rounded-full opacity-0 [background:linear-gradient(to_bottom,transparent,color-mix(in_srgb,var(--fg)_70%,transparent))]"
            style={{ "--t": `${t}s`, "--d": `${d}ms`, "--h": "620px" } as CSSProperties}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * While the target is read: the case being opened, a line at a time, what's being done right now (one request
 * does all of it). Stops at the last line, its cursor blinking, until the trail is in.
 */
export function CaseBoot({ caseId, chainName, address }: { caseId: string; chainName: string; address: string }) {
  const lines: ReactNode[] = [
    <>
      Case #{caseId} · {chainName}
    </>,
    <>
      Target
      <FullAddress address={address} max={12.5} className="mt-0.5 text-fg" />
    </>,
    "Reading its newest transactions",
    "Finding who funded it",
    "Sorting where its money went",
  ];
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => setShown((n) => (n < lines.length ? n + 1 : n)), 520);
    return () => window.clearInterval(id);
  }, [lines.length]);

  return (
    <div className="mx-auto max-w-md px-3 py-8 sm:px-4" role="status">
      <span className="sr-only">Reading the chain…</span>
      <div
        aria-hidden
        className="rounded-lg border border-border bg-bg/85 p-4 font-mono text-[12.5px] shadow-float backdrop-blur-sm"
      >
        {lines.slice(0, shown).map((line, i) => (
          <div key={i} className="boot-line flex gap-2 py-0.5 text-muted">
            <span className="text-subtle">›</span>
            <span className="min-w-0 flex-1">{line}</span>
          </div>
        ))}
        <p className="mt-1 flex items-center gap-2 text-subtle">
          <Scramble length={12} />
          <span className="caret inline-block h-3.5 w-1.5 bg-fg" />
        </p>
      </div>
    </div>
  );
}
