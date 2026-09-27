import clsx from "clsx";
import { avatarCells } from "@/lib/avatar";

// Geometry on a 64x64 canvas, like the Rankr mark.
const PAD = 12;
const CELL = (64 - 2 * PAD) / 5;
const GAP = 1.6;

/** A caller's avatar (see avatarCells): their own matrix on a tile. An empty tile while the account loads. */
export function Avatar({ userId, size = 24, className }: { userId: string | null; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={clsx("shrink-0 rounded-[22%] bg-surface-2 text-fg", className)}
      aria-hidden="true"
    >
      {(userId ? avatarCells(userId) : []).map(([c, r]) => (
        <rect
          key={`${c}${r}`}
          x={PAD + c * CELL + GAP / 2}
          y={PAD + r * CELL + GAP / 2}
          width={CELL - GAP}
          height={CELL - GAP}
          rx={CELL * 0.2}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
