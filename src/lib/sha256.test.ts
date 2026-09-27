import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

describe("sha256Hex", () => {
  it("matches the standard SHA-256", () => {
    for (const text of ["", "rankr", "a".repeat(55), "a".repeat(56), "b".repeat(64), "c".repeat(1000), "émoji 🚀 ✓"]) {
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    }
    expect(sha256Hex("rankr")).toBe("fa7f36c04fef6ea148542683457a54bab3ae8a314f866bba82c7e877acea4e3a");
  });
});
