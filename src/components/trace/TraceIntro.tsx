"use client";

import { useMemo } from "react";
import { exampleTrail } from "@/lib/trace/mock";
import { buildTree, layoutTree } from "@/lib/trace/tree";
import { delay } from "@/lib/motion";
import { PageHeader } from "../PageHeader";
import { TraceCanvas } from "./TraceCanvas";
import { TraceInput } from "./TraceInput";

const STEPS = [
  ["↑ In", "Who sent it money, and who sent them theirs. Its first money is marked 1ST."],
  ["● Target", "The wallet you pasted, with what it holds now."],
  ["↓ Out", "Where its money went, hop by hop, until it reaches an exchange, a bridge or a mixer."],
] as const;

/** The trace page before a wallet: the box, how the tree reads, and a made-up example of one. */
export function TraceIntro() {
  // A fixed clock: the server and the browser draw the same example.
  const example = useMemo(() => {
    const { root, data, expanded } = exampleTrail(Date.UTC(2026, 0, 1));
    return {
      layout: layoutTree(buildTree({ root, data, errors: new Map(), expanded, showAll: new Set() })),
      root: data.get(root)!,
    };
  }, []);

  return (
    <div className="space-y-8 pt-8 sm:pt-12">
      <PageHeader title="Follow the money">
        Paste a wallet. Rankr draws where its money came from and where it went, top to bottom, down to the exchange it
        was cashed out at. Solana, Ethereum, Base, Arbitrum, Optimism and Polygon.
      </PageHeader>
      <div className="cine-in max-w-2xl" style={delay(160)}>
        <TraceInput size="lg" autoFocus />
      </div>
      <ol className="cine-in grid gap-3 sm:grid-cols-3" style={delay(240)}>
        {STEPS.map(([k, v]) => (
          <li key={k} className="border-t border-border pt-3">
            <p className="label text-fg">{k}</p>
            <p className="mt-1 text-sm text-pretty text-muted">{v}</p>
          </li>
        ))}
      </ol>
      <section aria-label="Example" className="cine-in space-y-2" style={delay(320)}>
        <p className="label text-subtle">Example · made-up wallets</p>
        <div aria-hidden className="pointer-events-none select-none">
          <TraceCanvas
            layout={example.layout}
            root={example.root}
            selected={null}
            anchor={null}
            onPress={() => {}}
            onRetry={() => {}}
          />
        </div>
      </section>
    </div>
  );
}
