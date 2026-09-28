"use client";

import { useLayoutEffect, useRef, useState } from "react";

const format = (n: number) => n.toLocaleString("en-US");

/**
 * A whole number that counts up from zero when it first shows, then glides to each new value (the stats
 * are live). Fast, then a long settle, like the rest of the motion. Screen readers get the value itself;
 * reduced motion shows it straight away.
 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  // What's on screen now; null until the first count.
  const at = useRef<number | null>(null);

  // A layout effect, so the first frame already reads 0 rather than flashing the final value.
  useLayoutEffect(() => {
    const from = at.current ?? 0;
    if (from === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      at.current = value;
      setShown(value);
      return;
    }
    const duration = at.current === null ? 1100 : 600;
    const start = performance.now();
    setShown(from);
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const n = Math.round(from + (value - from) * (1 - (1 - t) ** 4));
      at.current = n;
      setShown(n);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
