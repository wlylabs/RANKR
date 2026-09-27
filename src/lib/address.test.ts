import { describe, expect, it } from "vitest";
import { parseInput, tokenId } from "./address";

const SOL = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
const PUMP = "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump";
const EVM = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";

describe("parseInput", () => {
  it("accepts raw addresses", () => {
    expect(parseInput(SOL)).toEqual({ address: SOL, chainHint: null });
    expect(parseInput(`  ${EVM}\n`)).toEqual({ address: EVM, chainHint: null });
    expect(parseInput(`"${PUMP}"`)).toEqual({ address: PUMP, chainHint: null });
  });

  it("pulls the address out of common links", () => {
    expect(parseInput(`https://pump.fun/coin/${PUMP}`)).toEqual({ address: PUMP, chainHint: "solana" });
    expect(parseInput(`https://dexscreener.com/base/${EVM.toLowerCase()}`)).toEqual({
      address: EVM.toLowerCase(),
      chainHint: "base",
    });
    expect(parseInput(`gmgn.ai/sol/token/${SOL}`)).toEqual({ address: SOL, chainHint: "solana" });
    expect(parseInput(`https://etherscan.io/token/${EVM}`)).toEqual({ address: EVM, chainHint: "ethereum" });
    expect(parseInput(`https://birdeye.so/token/${SOL}?chain=solana`)).toEqual({ address: SOL, chainHint: "solana" });
    expect(parseInput(`https://jup.ag/swap?outputMint=${SOL}`)).toEqual({ address: SOL, chainHint: null });
  });

  it("rejects things that are not addresses", () => {
    expect(parseInput("")).toBeNull();
    expect(parseInput("hello world")).toBeNull();
    expect(parseInput("$PEPE")).toBeNull();
    expect(parseInput("0xabc")).toBeNull();
    expect(parseInput("https://pump.fun/board")).toBeNull();
  });
});

describe("tokenId", () => {
  it("is case-insensitive for EVM only", () => {
    expect(tokenId("base", EVM)).toBe(tokenId("base", EVM.toLowerCase()));
    expect(tokenId("solana", SOL)).toBe(`solana:${SOL}`);
  });
});
