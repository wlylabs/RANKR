"use client";

import clsx from "clsx";
import { useLayoutEffect, useRef, useState } from "react";
import { NODE_H, rowLabel, strokeFor, type Edge, type Layout, type Placed } from "@/lib/trace/tree";
import type { TraceResponse } from "@/lib/trace/types";
import { TraceCard } from "./TraceCard";

/** A line from the card above to the card below, bending like a root. */
function path(e: Edge, dx: number): string {
  const x1 = e.x1 + dx;
  const x2 = e.x2 + dx;
  const my = (e.y2 - e.y1) / 2;
  return `M ${x1} ${e.y1} C ${x1} ${e.y1 + my}, ${x2} ${e.y2 - my}, ${x2} ${e.y2}`;
}

const TONE: Record<Edge["tone"], { line: string; packets: string | null }> = {
  plain: { line: "var(--border-strong)", packets: "var(--fg)" },
  end: { line: "var(--muted)", packets: "var(--fg)" },
  danger: { line: "var(--down)", packets: "var(--down)" },
  faint: { line: "var(--border)", packets: null },
};

type Props = {
  layout: Layout;
  root: TraceResponse | null;
  selected: string | null;
  /** The card the tree keeps still on screen while it grows or shrinks around it. */
  anchor: string | null;
  onPress: (placed: Placed) => void;
  onRetry: (placed: Placed) => void;
};

/**
 * The tree, drawn: dotted ledger, a caption per row, lines with money running down them, cards on top. Wider
 * than the screen, it scrolls sideways (opening on the target); the page scrolls down.
 */
export function TraceCanvas({ layout, root, selected, anchor, onPress, onRetry }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const last = useRef<{ id: string; x: number } | null>(null);
  const centered = useRef(false);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Narrower than the screen, the tree sits in the middle.
  const offset = Math.max(0, (width - layout.width) / 2);
  const stage = Math.max(width, layout.width);

  // Opens on the target; afterwards, the card last pressed (the target until one is) stays where it was on
  // screen while the tree grows or shrinks around it.
  const keep = anchor ?? "root";
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !width) return;
    const now = layout.nodes.find((n) => n.item.id === keep);
    if (!centered.current) {
      if (now) el.scrollLeft = now.x + offset - width / 2;
      centered.current = true;
    } else if (now && last.current?.id === keep) {
      el.scrollLeft += now.x + offset - last.current.x;
    }
    last.current = now ? { id: keep, x: now.x + offset } : null;
  }, [layout, keep, offset, width]);

  return (
    // The row captions sit over the scroller, so they stay on screen while the tree scrolls sideways.
    <div className="relative">
      <div
        ref={scroller}
        className="trace-grid relative overflow-x-auto overscroll-x-contain rounded-xl border border-border"
      >
        <div className="relative" style={{ width: stage, height: layout.height }}>
          {layout.rows.map((r) => (
            <div
              key={r.depth}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70"
              style={{ top: r.y - NODE_H / 2 - 16 }}
            />
          ))}
          <svg className="pointer-events-none absolute inset-0" width={stage} height={layout.height} aria-hidden>
            {layout.edges.map((e) => {
              const d = path(e, offset);
              const tone = TONE[e.tone];
              const w = strokeFor(e.usd);
              return (
                <g key={e.id} fill="none">
                  <path
                    className="trace-edge"
                    d={d}
                    // Inline, so it wins over the class: the line glides with its cards where CSS can move a path.
                    style={{ d: `path("${d}")`, ...(e.tone === "faint" && { strokeDasharray: "0.012 0.014" }) }}
                    pathLength={1}
                    stroke={tone.line}
                    strokeWidth={w}
                    strokeLinecap="round"
                  />
                  {tone.packets && (
                    <path
                      className="trace-packets"
                      d={d}
                      style={{ d: `path("${d}")` }}
                      stroke={tone.packets}
                      strokeOpacity={e.tone === "plain" ? 0.45 : 0.7}
                      strokeWidth={Math.max(1.5, w)}
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          {layout.nodes.map((n) => (
            <TraceCard
              key={n.item.id}
              placed={n}
              offset={offset}
              root={root}
              selected={selected === n.item.id}
              onPress={onPress}
              onRetry={() => onRetry(n)}
            />
          ))}
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {layout.rows.map((r) => (
          <span
            key={r.depth}
            className={clsx(
              "label absolute left-3 rounded-sm bg-bg/80 px-1",
              r.depth === 0 ? "text-fg" : "text-subtle",
            )}
            style={{ top: r.y - NODE_H / 2 - 13 }}
          >
            {rowLabel(r.depth)}
          </span>
        ))}
      </div>
    </div>
  );
}
