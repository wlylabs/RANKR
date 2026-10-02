// What a label's kind means for the trail. Kept apart from labels.ts, whose lists only the server loads.
import type { TraceLabel, TraceLabelKind } from "./types";

/** Labels that end a trail: money that reaches them is cashed out, bridged, mixed or swapped. */
const TERMINAL = new Set<TraceLabelKind>(["cex", "bridge", "mixer", "dex", "contract"]);

export function isTerminal(label: TraceLabel | null): boolean {
  return !!label && TERMINAL.has(label.kind);
}

/** Labels that mean trouble: drawn in red, and raised as flags on the case file. */
export const DANGER = new Set<TraceLabelKind>(["sanctioned", "hack", "scam", "mixer", "frozen"]);
