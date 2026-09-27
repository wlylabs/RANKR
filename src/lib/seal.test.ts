import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sealOf } from "./rankr";

describe("entry seal", () => {
  const entry = { chainId: "solana", address: "Mint111", entryPriceUsd: 0.00001234, firstPastedAt: 1_790_000_000_000 };

  it("is sha256 over the locked entry fields", () => {
    const expected = createHash("sha256").update("solana:Mint111:0.00001234:1790000000000").digest("hex");
    expect(sealOf(entry)).toBe(expected);
  });

  it("changes when the entry is edited", () => {
    expect(sealOf({ ...entry, entryPriceUsd: 0.00001 })).not.toBe(sealOf(entry));
    expect(sealOf({ ...entry, firstPastedAt: entry.firstPastedAt - 1 })).not.toBe(sealOf(entry));
  });
});
