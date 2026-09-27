import clsx from "clsx";

/**
 * The Rankr mark is derived from the name itself: the letter "r" set on a 5x5 matrix,
 * with the other 18 cells lit by SHA-256("rankr"). Cell i is lit when bit pair i of the
 * digest is "11". Nobody else's name hashes to this pattern.
 */
export const RANKR_SHA256 = "fa7f36c04fef6ea148542683457a54bab3ae8a314f866bba82c7e877acea4e3a";

const GRID = 5;
const LETTER: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, 2], [0, 3], [0, 4], // stem
  [1, 2], // joint
  [2, 1], [3, 1], // shoulder
];

function bitsOf(hex: string): string {
  return [...hex].map((h) => parseInt(h, 16).toString(2).padStart(4, "0")).join("");
}

export function markCells(hex = RANKR_SHA256) {
  const bits = bitsOf(hex);
  const isLetter = (c: number, r: number) => LETTER.some(([x, y]) => x === c && y === r);
  const hash: [number, number][] = [];
  let i = 0;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (isLetter(c, r)) continue;
      if (bits.slice(2 * i, 2 * i + 2) === "11") hash.push([c, r]);
      i++;
    }
  }
  return { letter: LETTER, hash };
}

// Geometry on a 64x64 canvas.
const PAD = 10;
const CELL = (64 - 2 * PAD) / GRID;
const GAP = 1.6;

/** SVG children for the mark (plain elements, so next/og can render them too). */
export function markElements(fg: string, dim: string, dimOpacity = 1) {
  const { letter, hash } = markCells();
  return [
    ...letter.map(([c, r]) => (
      <rect
        key={`l${c}${r}`}
        x={PAD + c * CELL + GAP / 2}
        y={PAD + r * CELL + GAP / 2}
        width={CELL - GAP}
        height={CELL - GAP}
        rx={CELL * 0.2}
        fill={fg}
      />
    )),
    ...hash.map(([c, r]) => (
      <circle
        key={`h${c}${r}`}
        cx={PAD + c * CELL + CELL / 2}
        cy={PAD + r * CELL + CELL / 2}
        r={CELL * 0.15}
        fill={dim}
        opacity={dimOpacity}
      />
    )),
  ];
}

/** The app-icon form: a solid tile in the text color with the matrix knocked out of it. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <g style={{ color: "var(--bg)" }}>{markElements("currentColor", "currentColor", 0.5)}</g>
    </svg>
  );
}

export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="text-[17px] leading-none font-semibold tracking-[-0.04em]">rankr</span>
    </span>
  );
}
