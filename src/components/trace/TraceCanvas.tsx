"use client";

import clsx from "clsx";
import { LocateFixed, Maximize2, Minimize2, Minus, Plus, Scan, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NODE_H, NODE_W, rowLabel, strokeFor, type Edge, type Layout, type Placed } from "@/lib/trace/tree";
import { bound, fitView, reveal, startView, zoomAt, type Box, type Size, type View } from "@/lib/trace/viewport";
import type { TraceResponse } from "@/lib/trace/types";
import { TraceCard } from "./TraceCard";

/** A line from the card above to the card below, bending like a root. */
function path(e: Edge): string {
  const my = (e.y2 - e.y1) / 2;
  return `M ${e.x1} ${e.y1} C ${e.x1} ${e.y1 + my}, ${e.x2} ${e.y2 - my}, ${e.x2} ${e.y2}`;
}

const TONE: Record<Edge["tone"], { line: string; packets: string | null }> = {
  plain: { line: "var(--border-strong)", packets: "var(--fg)" },
  end: { line: "var(--muted)", packets: "var(--fg)" },
  danger: { line: "var(--down)", packets: "var(--down)" },
  faint: { line: "var(--border)", packets: null },
};

/** A card's box, in the tree's coordinates. */
const boxOf = (n: Placed): Box => ({
  left: n.x - NODE_W / 2,
  top: n.y - NODE_H / 2,
  right: n.x + NODE_W / 2,
  bottom: n.y + NODE_H / 2,
});
const union = (a: Box, b: Box): Box => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
});

/** Dragging further than this is a pan, not a tap. */
const TAP_SLOP = 6;
/** As long as the cards take to glide to new places (.trace-node). */
const GLIDE_MS = 500;

type Props = {
  layout: Layout;
  root: TraceResponse | null;
  selected: string | null;
  /** The card the tree keeps still on screen while it grows or shrinks around it (the target until one is pressed). */
  anchor: string | null;
  onPress: (placed: Placed) => void;
  onRetry: (placed: Placed) => void;
  fullscreen: boolean;
  onFullscreen: (on: boolean) => void;
  /** Over the top of the screen in fullscreen. */
  title?: ReactNode;
  /** Over the bottom of the frame in fullscreen: the picked card. */
  footer?: ReactNode;
  /** The frame's height on the page. */
  className?: string;
};

function Control({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {children}
    </button>
  );
}

/**
 * The tree, drawn in a frame that works like a map: drag to pan, pinch or Ctrl + scroll to zoom, buttons to zoom,
 * fit it all, go back to the target and go fullscreen. Dotted ledger, a caption per row, lines with money running
 * down them, cards on top. The card last pressed stays put while the tree reshapes around it, and what it opened
 * is brought into view.
 */
export function TraceCanvas({
  layout,
  root,
  selected,
  anchor,
  onPress,
  onRetry,
  fullscreen,
  onFullscreen,
  title,
  footer,
  className,
}: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const size = useRef<Size | null>(null);
  const placed = useRef(false);
  const latest = useRef({ layout, fullscreen });
  latest.current = { layout, fullscreen };
  const glide = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Moves the camera: three variables on the frame, nothing re-rendered. */
  const apply = useCallback((v: View, animate = false) => {
    view.current = v;
    const el = frame.current;
    if (!el) return;
    if (animate) {
      el.classList.add("is-animating");
      clearTimeout(glide.current);
      glide.current = setTimeout(() => el.classList.remove("is-animating"), GLIDE_MS + 40);
    }
    el.style.setProperty("--tx", String(v.x));
    el.style.setProperty("--ty", String(v.y));
    el.style.setProperty("--k", String(v.k));
  }, []);

  const content = (l: Layout): Size => ({ width: l.width, height: l.height });
  const insets = () => ({ top: 0, bottom: latest.current.fullscreen ? (footerRef.current?.offsetHeight ?? 0) : 0 });

  /** Where it opens, and where "back to the target" goes: the target, at a size cards can be read at. */
  const home = useCallback((l: Layout, s: Size) => {
    const target = l.nodes.find((n) => n.item.id === "root");
    return target ? startView(content(l), s, target) : fitView(content(l), s);
  }, []);

  // The frame's size: the first view once it's known; afterwards (fullscreen, rotating the phone) the middle of
  // the frame stays on the same part of the tree.
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    // Going fullscreen moves the frame to a new element: it takes the camera along.
    if (placed.current) apply(view.current);
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      if (!next.width || !next.height) return;
      const prev = size.current;
      size.current = next;
      const l = latest.current.layout;
      if (!placed.current) {
        placed.current = true;
        apply(home(l, next));
      } else if (prev && (prev.width !== next.width || prev.height !== next.height)) {
        const v = view.current;
        apply(
          bound(
            { ...v, x: v.x + (next.width - prev.width) / 2, y: v.y + (next.height - prev.height) / 2 },
            content(l),
            next,
          ),
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [apply, home, fullscreen]);

  // The tree reshaped (a wallet opened, folded, or read): the card last pressed stays where it was on screen,
  // gliding with its cards, and then what it opened comes into view.
  const before = useRef<Layout | null>(null);
  const keep = anchor ?? "root";
  useLayoutEffect(() => {
    const prev = before.current;
    before.current = layout;
    const s = size.current;
    if (!prev || !s || !placed.current || prev === layout) return;
    const was = prev.nodes.find((n) => n.item.id === keep);
    const now = layout.nodes.find((n) => n.item.id === keep);
    let v = view.current;
    if (was && now) v = { ...v, x: v.x + (was.x - now.x) * v.k, y: v.y + (was.y - now.y) * v.k };
    if (now?.item.expanded && now.item.children.length) {
      const ids = new Set(now.item.children.map((c) => c.id));
      const box = layout.nodes.filter((n) => ids.has(n.item.id)).reduce((b, n) => union(b, boxOf(n)), boxOf(now));
      v = reveal(v, box, s, now.item.side === "in" ? "bottom" : "top", insets());
    }
    apply(bound(v, content(layout), s), true);
  }, [layout, keep, apply]);

  // Drag to pan (a finger or the mouse), pinch to zoom, Ctrl / ⌘ + scroll (and trackpad pinches) to zoom, sideways
  // scroll to pan; in fullscreen any scroll pans. A drag never counts as a tap on the card it started on.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const points = new Map<number, { x: number; y: number }>();
    let moved = false;
    let origin = { x: 0, y: 0 };
    let pinch: { d: number; cx: number; cy: number } | null = null;

    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const two = () => {
      const [a, b] = [...points.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    };
    const settle = () => {
      const s = size.current;
      if (s) apply(bound(view.current, content(latest.current.layout), s), true);
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ((e.target as Element).closest("[data-no-pan]")) return;
      const p = local(e);
      points.set(e.pointerId, p);
      if (points.size === 1) {
        moved = false;
        origin = p;
      } else if (points.size === 2) {
        moved = true;
        pinch = two();
      }
    };
    const move = (e: PointerEvent) => {
      const prev = points.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      if (points.size === 1) {
        if (!moved) {
          if (Math.hypot(p.x - origin.x, p.y - origin.y) < TAP_SLOP) return;
          moved = true;
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* the pointer is already gone */
          }
          el.classList.add("is-grabbing");
        }
        points.set(e.pointerId, p);
        const v = view.current;
        apply({ ...v, x: v.x + p.x - prev.x, y: v.y + p.y - prev.y });
      } else if (points.size === 2 && pinch) {
        points.set(e.pointerId, p);
        const now = two();
        const v = zoomAt(view.current, now.d / pinch.d, now.cx, now.cy);
        apply({ ...v, x: v.x + now.cx - pinch.cx, y: v.y + now.cy - pinch.cy });
        pinch = now;
      }
    };
    const up = (e: PointerEvent) => {
      if (!points.delete(e.pointerId)) return;
      pinch = points.size === 2 ? two() : null;
      if (!points.size) {
        el.classList.remove("is-grabbing");
        if (moved) settle();
        // After the click this release may fire (and swallow), so Enter on a card later still works.
        setTimeout(() => (moved = false), 0);
      }
    };
    const click = (e: MouseEvent) => {
      if (!moved) return;
      e.stopPropagation();
      e.preventDefault();
      moved = false;
    };
    const wheel = (e: WheelEvent) => {
      const zoom = e.ctrlKey || e.metaKey;
      const sideways = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      // On the page, an ordinary scroll scrolls the page.
      if (!zoom && !sideways && !latest.current.fullscreen) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      const v = view.current;
      const s = size.current;
      if (!s) return;
      if (zoom) {
        const p = local(e);
        apply(bound(zoomAt(v, Math.exp(-e.deltaY * unit * 0.0025), p.x, p.y), content(latest.current.layout), s));
      } else {
        const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
        const dy = sideways ? 0 : e.deltaY * unit;
        apply(bound({ ...v, x: v.x - dx, y: v.y - dy }, content(latest.current.layout), s));
      }
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
      el.removeEventListener("wheel", wheel);
    };
  }, [apply, fullscreen]);

  // Fullscreen: the page behind stays put, and Esc leaves.
  useEffect(() => {
    if (!fullscreen) return;
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, onFullscreen]);

  const zoomBy = (factor: number) => {
    const s = size.current;
    if (s) apply(bound(zoomAt(view.current, factor, s.width / 2, s.height / 2), content(layout), s), true);
  };
  const fit = () => {
    if (size.current) apply(fitView(content(layout), size.current), true);
  };
  const toTarget = () => {
    if (size.current) apply(home(layout, size.current), true);
  };

  // A card reached with Tab comes into view (the frame never scrolls itself: the camera does).
  const onFocus = (e: React.FocusEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
    const n = id ? layout.nodes.find((x) => x.item.id === id) : undefined;
    if (n && size.current) apply(reveal(view.current, boxOf(n), size.current, "top", insets()), true);
  };

  const frameTree = (
    <div
      className={clsx(
        fullscreen ? "fixed inset-0 z-50 flex flex-col bg-bg pt-[env(safe-area-inset-top)]" : "relative",
        !fullscreen && className,
      )}
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? "Trail, fullscreen" : undefined}
    >
      {fullscreen && (
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <div className="min-w-0 flex-1 truncate">{title}</div>
          <button
            type="button"
            onClick={() => onFullscreen(false)}
            className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Leave fullscreen"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <div
        ref={frame}
        onScroll={(e) => {
          e.currentTarget.scrollTop = 0;
          e.currentTarget.scrollLeft = 0;
        }}
        onFocus={onFocus}
        className={clsx(
          "trace-grid trace-viewport relative overflow-hidden select-none",
          fullscreen ? "min-h-0 flex-1" : "h-full rounded-xl border border-border",
        )}
      >
        <div className="trace-stage absolute top-0 left-0" style={{ width: layout.width, height: layout.height }}>
          {layout.rows.map((r) => (
            <div
              key={r.depth}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70"
              style={{ top: r.y - NODE_H / 2 - 16 }}
            />
          ))}
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={layout.width}
            height={layout.height}
            aria-hidden
          >
            {layout.edges.map((e) => {
              const d = path(e);
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
              root={root}
              selected={selected === n.item.id}
              onPress={onPress}
              onRetry={() => onRetry(n)}
            />
          ))}
        </div>

        {/* Row captions stay at the left edge, following the rows up and down. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {layout.rows.map((r) => (
            <span
              key={r.depth}
              className={clsx(
                "trace-caption label absolute left-3 rounded-sm bg-bg/80 px-1",
                r.depth === 0 ? "text-fg" : "text-subtle",
              )}
              style={{ "--row": r.y - NODE_H / 2 - 34 } as React.CSSProperties}
            >
              {rowLabel(r.depth)}
            </span>
          ))}
        </div>

        <div
          data-no-pan
          className="absolute top-2 right-2 flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg/90 shadow-float backdrop-blur-sm"
        >
          <Control label="Zoom in" onClick={() => zoomBy(1.25)}>
            <Plus className="size-4" />
          </Control>
          <Control label="Zoom out" onClick={() => zoomBy(0.8)}>
            <Minus className="size-4" />
          </Control>
          <Control label="Fit the whole trail" onClick={fit}>
            <Scan className="size-4" />
          </Control>
          <Control label="Back to the target" onClick={toTarget}>
            <LocateFixed className="size-4" />
          </Control>
          <Control label={fullscreen ? "Leave fullscreen" : "Fullscreen"} onClick={() => onFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Control>
        </div>

        {fullscreen && footer && (
          <div ref={footerRef} data-no-pan className="absolute inset-x-0 bottom-0 cursor-auto select-text">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  // Fullscreen goes straight under <body>: inside the page, an animated wrapper would keep it under the app's
  // header and bottom nav whatever its z-index.
  return fullscreen ? createPortal(frameTree, document.body) : frameTree;
}
