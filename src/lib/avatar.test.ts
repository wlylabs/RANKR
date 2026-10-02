import { describe, expect, it } from "vitest";
import { avatarCells, avatarFile } from "./avatar";

const ids = Array.from({ length: 300 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("avatarCells", () => {
  it("is a mirrored 5x5 pattern, the same for the same account", () => {
    const cells = avatarCells(ids[0]);
    expect(avatarCells(ids[0])).toEqual(cells);
    for (const [c, r] of cells) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(5);
      expect(cells).toContainEqual([4 - c, r]);
    }
  });

  it("is never nearly blank or nearly solid, and tells accounts apart", () => {
    const all = ids.map(avatarCells);
    for (const cells of all) {
      expect(cells.length).toBeGreaterThanOrEqual(6);
      expect(cells.length).toBeLessThanOrEqual(18);
    }
    expect(new Set(all.map((c) => JSON.stringify(c))).size).toBeGreaterThan(290);
  });
});

describe("avatarFile", () => {
  it("is named after the account", () => {
    expect(avatarFile("nonce_7f3a")).toBe("rankr-nonce_7f3a.png");
  });
});
