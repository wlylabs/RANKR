import type { CSSProperties } from "react";

/** `--d` for a staggered entrance (.cine-in, .reveal-in), in ms. Usable from server and client components. */
export function delay(ms: number): CSSProperties {
  return { "--d": `${ms}ms` } as CSSProperties;
}
