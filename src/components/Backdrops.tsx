"use client";

import type { CSSProperties } from "react";
import { avatarCells } from "@/lib/avatar";

// A backdrop for the top of each app page, each about what the page is (the landing has its hash field, Trace its
// dripping ledger): pure decoration behind the page header, hidden from screen readers, never catching clicks,
// still with reduced motion. The header must be `relative isolate`.

const frame =
  "field-in pointer-events-none absolute -top-16 -bottom-10 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden";
const dots = "absolute inset-0 [background-image:radial-gradient(circle,var(--border-strong)_1px,transparent_1.3px)]";

/** Feed: on air. Rings of signal going out from where the calls come in, one after another. */
export function SignalField() {
  return (
    <div
      aria-hidden
      className={`${frame} [mask-image:radial-gradient(ellipse_75%_90%_at_70%_40%,#000_25%,transparent_100%)]`}
    >
      <div className={dots} style={{ backgroundSize: "28px 28px", backgroundPosition: "50% 0" }} />
      <div className="absolute top-[42%] left-[78%] sm:left-[70%]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="signal-ring absolute top-1/2 left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border-strong opacity-0"
            style={{ "--d": `${i * 1300}ms` } as CSSProperties}
          />
        ))}
        <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-up" />
      </div>
    </div>
  );
}

/** Leaderboard: the stage. Two spotlights from above, swaying slowly over the board. */
export function StageLights() {
  return (
    <div aria-hidden className={`${frame} [mask-image:linear-gradient(to_bottom,#000_40%,transparent)]`}>
      <div
        className={`${dots} [mask-image:radial-gradient(ellipse_70%_80%_at_50%_0%,#000_20%,transparent_80%)]`}
        style={{ backgroundSize: "28px 28px", backgroundPosition: "50% 0" }}
      />
      {[
        { left: "22%", r: 14, d: 0 },
        { left: "78%", r: -14, d: 2600 },
      ].map(({ left, r, d }) => (
        <span
          key={left}
          className="spot absolute -top-24 h-[150%] w-56 origin-top blur-2xl sm:w-80 [background:linear-gradient(to_bottom,color-mix(in_srgb,var(--fg)_13%,transparent),transparent_85%)] [clip-path:polygon(42%_0,58%_0,100%_100%,0_100%)]"
          style={{ left, "--r": `${r}deg`, "--d": `${d}ms` } as CSSProperties}
        />
      ))}
    </div>
  );
}

const CELL = 22;

/**
 * You: your own glyph (the avatar every wallet and caller gets from its id), large and faint behind the page's
 * top, its cells coming in as a scan passes down them: Rankr picking you out.
 */
export function IdentityField({ seed }: { seed: string }) {
  const cells = avatarCells(seed);
  return (
    <div
      aria-hidden
      className={`${frame} [mask-image:radial-gradient(ellipse_80%_90%_at_75%_45%,#000_30%,transparent_100%)]`}
    >
      <div className={dots} style={{ backgroundSize: "26px 26px", backgroundPosition: "50% 0" }} />
      <div className="absolute top-[24%] right-[6%] sm:right-[14%]" style={{ width: CELL * 5, height: CELL * 5 }}>
        {cells.map(([c, r]) => (
          <span
            key={`${c}.${r}`}
            className="glyph-cell absolute rounded-[5px] bg-fg/10"
            style={
              {
                left: c * CELL + 2,
                top: r * CELL + 2,
                width: CELL - 4,
                height: CELL - 4,
                "--d": `${300 + r * 140 + c * 30}ms`,
              } as CSSProperties
            }
          />
        ))}
        <span className="id-scan absolute -inset-x-3 top-0 h-px bg-fg/60 opacity-0 shadow-[0_0_12px_2px_color-mix(in_srgb,var(--fg)_35%,transparent)]" />
      </div>
    </div>
  );
}
