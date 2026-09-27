"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "0123456789abcdef";

/**
 * Reveals text left to right out of random hex, once, on first mount. Server render and
 * screen readers get the real text; later changes to `text` show up without animating.
 */
export function DecryptText({ text, className, duration = 900 }: { text: string; className?: string; duration?: number }) {
  const [frame, setFrame] = useState<string | null>(null);
  const played = useRef(false);

  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const start = performance.now();
    const id = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / duration);
      const revealed = Math.floor(progress * text.length);
      if (progress >= 1) {
        window.clearInterval(id);
        setFrame(null);
        return;
      }
      setFrame(
        [...text]
          .map((ch, i) => (i < revealed || ch === " " ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(""),
      );
    }, 40);
    return () => window.clearInterval(id);
    // Only the first mount animates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{frame ?? text}</span>
    </span>
  );
}
