"use client";

import { useCallback, useState } from "react";
import { delay } from "@/lib/motion";
import { exampleTrail, exampleWallet } from "@/lib/trace/mock";
import type { TraceResponse } from "@/lib/trace/types";
import { PageHeader } from "../PageHeader";
import { TrailField } from "./TraceCinema";
import { TraceInput } from "./TraceInput";
import { TracePath } from "./TracePath";
import { useTrail } from "./useTrail";

const STEPS = [
  ["↑ In", "Who sent it money, and who sent them theirs. Its first money is marked 1ST."],
  ["● Target", "The wallet you pasted, with what it holds now."],
  ["↓ Out", "Where its money went, hop by hop, until it reaches an exchange, a bridge or a mixer."],
] as const;

const NO_ERRORS = new Map<string, string>();

/** The trace page before a wallet: the box, how a trail reads, and a made-up one to play with. */
export function TraceIntro() {
  // A playground: the wallets are made up on the spot (the same each time), so every one of them opens.
  const [start] = useState(exampleTrail);
  const [data, setData] = useState<Map<string, TraceResponse>>(start.data);
  const read = useCallback((a: string) => setData((m) => new Map(m).set(a, exampleWallet(a))), []);
  const trail = useTrail(start.root, data, NO_ERRORS, read, { expanded: start.expanded });

  return (
    <div className="space-y-8 pt-8 sm:pt-12">
      <div className="relative isolate space-y-8">
        <TrailField />
        <PageHeader title="Follow the money">
          Paste a wallet. Rankr draws where its money came from and where it went, top to bottom, down to the exchange
          it was cashed out at. Solana, Ethereum, Base, Arbitrum, Optimism and Polygon.
        </PageHeader>
        <div className="cine-in max-w-2xl" style={delay(160)}>
          <TraceInput size="lg" autoFocus />
        </div>
        <ol className="cine-in grid gap-3 sm:grid-cols-3" style={delay(240)}>
          {STEPS.map(([k, v]) => (
            <li key={k} className="border-t border-border bg-bg/60 pt-3 backdrop-blur-[1px]">
              <p className="label text-fg">{k}</p>
              <p className="mt-1 text-sm text-pretty text-muted">{v}</p>
            </li>
          ))}
        </ol>
      </div>
      <section aria-label="Example" className="cine-in space-y-2" style={delay(320)}>
        <p className="label text-subtle">Example · made-up wallets · tap Follow the money, or Switch at a fork</p>
        <TracePath
          steps={trail.steps}
          items={trail.items}
          root={data.get(start.root)!}
          onFollow={trail.follow}
          onPick={trail.pick}
          onRetry={() => {}}
        />
      </section>
    </div>
  );
}
