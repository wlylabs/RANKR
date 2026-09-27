import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RANKR_SHA256, markCells } from "@/components/Logo";

describe("logo", () => {
  it("is derived from SHA-256 of the name", () => {
    expect(createHash("sha256").update("rankr").digest("hex")).toBe(RANKR_SHA256);
  });

  it("lights the cells whose bit pair is 11", () => {
    const { letter, hash } = markCells();
    expect(letter).toHaveLength(7);
    expect(hash).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [4, 1],
      [2, 2],
      [4, 2],
      [3, 3],
    ]);
  });

  it("favicon matches the component", () => {
    const svg = readFileSync(path.join(__dirname, "../app/icon.svg"), "utf8");
    expect(svg).toContain(RANKR_SHA256);
    expect(svg.match(/<circle /g)).toHaveLength(markCells().hash.length);
    expect(svg.match(/<rect /g)).toHaveLength(markCells().letter.length + 1); // + tile
  });
});
