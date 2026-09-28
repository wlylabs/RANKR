"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { delay } from "@/lib/motion";
import { RANKR_SHA256 } from "./Logo";

// The field's lit cells come from the same digest as the logo, SHA-256("rankr"): a cell is lit when its
// bit pair is "11" (thinned to every third diagonal). Cells behind the text are left dark, so the lit ones
// frame the headline instead of flickering through it.
const CELL = 28;
const COLS = 44;
const ROWS = 18;
const LIT = (() => {
  const bits = [...RANKR_SHA256].map((h) => parseInt(h, 16).toString(2).padStart(4, "0")).join("");
  const cells: { x: number; y: number; t: number; d: number }[] = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const p = (i * 2) % bits.length;
    const x = i % COLS - COLS / 2;
    const y = Math.floor(i / COLS) - ROWS / 2;
    const behindText = (x / 12) ** 2 + (y / 7.5) ** 2 < 1;
    if (bits[p] === "1" && bits[p + 1] === "1" && (x + y) % 3 === 0 && !behindText) {
      const h = parseInt(RANKR_SHA256[i % 64], 16);
      cells.push({ x, y, t: 4 + (h % 5), d: (h * 431) % 5000 });
    }
  }
  return cells;
})();

/**
 * The hero's backdrop: a dot matrix that fades out toward the edges, a few cells breathing in and out,
 * and a soft light that follows the pointer on desktop. Pure decoration: hidden from screen readers,
 * never catches clicks.
 */
export function HashField() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--x", `${e.clientX - r.left}px`);
        el.style.setProperty("--y", `${e.clientY - r.top}px`);
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="field-in pointer-events-none absolute top-0 left-1/2 -z-10 h-full w-screen -translate-x-1/2 overflow-hidden [mask-image:radial-gradient(ellipse_62%_70%_at_50%_50%,#000_35%,transparent_100%)]"
    >
      {/* Everything is laid out from one origin (the hero's focal point) so lit cells sit on grid dots. */}
      <div className="absolute top-1/2 left-1/2">
        <div
          className="absolute -top-[700px] -left-[1400px] h-[1400px] w-[2800px] [background-image:radial-gradient(circle,var(--border-strong)_1px,transparent_1.3px)]"
          style={{ backgroundSize: `${CELL}px ${CELL}px` }}
        />
        {LIT.map(({ x, y, t, d }) => (
          <span
            key={`${x}.${y}`}
            className="twinkle absolute size-[3px] rounded-full bg-fg opacity-40"
            style={{
              left: x * CELL + CELL / 2 - 1.5,
              top: y * CELL + CELL / 2 - 1.5,
              ...({ "--t": `${t}s`, "--d": `${d}ms` } as CSSProperties),
            }}
          />
        ))}
      </div>
      {/* Pointer light (desktop); rests above the headline until the pointer moves. */}
      <div className="absolute inset-0 [background:radial-gradient(420px_circle_at_var(--x,50%)_var(--y,45%),color-mix(in_srgb,var(--fg)_7%,transparent),transparent_70%)]" />
    </div>
  );
}

/**
 * A list whose rows rise in one after another when it first shows (.cascade). The class goes once the list
 * has settled, so rows that a live refresh moves or adds don't replay the entrance. `as` keeps list and
 * table markup valid.
 */
export function Cascade({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "ul" | "ol" | "tbody";
  className?: string;
  children: ReactNode;
}) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(true), 1200);
    return () => window.clearTimeout(id);
  }, []);
  return <Tag className={clsx(className, !settled && "cascade")}>{children}</Tag>;
}

/**
 * Below-the-fold content that arrives as it scrolls into view (blur, rise, fade), staggered by `delay`.
 * Anything already on screen when the page loads is left alone, and so is everything with reduced motion,
 * so nothing ever blinks out.
 */
export function Reveal({ children, delay: ms = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "in">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState("hidden");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setState("in");
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay(ms)}
      className={clsx(className, state === "hidden" && "reveal-hidden", state === "in" && "reveal-in")}
    >
      {children}
    </div>
  );
}
