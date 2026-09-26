"use client";

import { animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Ticks a number toward `value` instead of snapping. No-op on the first
 * render (prev === value), so a freshly mounted list doesn't animate
 * up from zero — only later changes tick.
 */
export function useCountUp(value: number, durationMs = 600): number {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    const controls = animate(prev.current, value, {
      duration: durationMs / 1000,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, durationMs]);

  return display;
}
