// A caller's avatar is drawn from the account, not uploaded: a 5x5 matrix mirrored left to right, lit by
// sha256 of the user id, in the style of the Rankr mark. Same account, same avatar, whatever its name.
import { sha256Hex } from "./sha256";

const GRID = 5;

/** Lit cells as [column, row]. */
export function avatarCells(userId: string): [number, number][] {
  const bits = [...sha256Hex(`rankr/avatar:${userId}`)].map((h) => parseInt(h, 16).toString(2).padStart(4, "0")).join("");
  let cells: [number, number][] = [];
  // 15 bits fill the left three columns (the right two mirror them). The first 15 that light 6 to 18 of
  // the 25 cells, so no avatar comes out nearly blank or nearly solid.
  for (let at = 0; at + 15 <= bits.length; at += 15) {
    cells = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (bits[at + r * 3 + Math.min(c, GRID - 1 - c)] === "1") cells.push([c, r]);
      }
    }
    if (cells.length >= 6 && cells.length <= 18) break;
  }
  return cells;
}
