import { describe, expect, it } from "vitest";
import { callHref } from "./format";
import { callCardFile, callShareText } from "./share";

const call = { username: "nonce_7f3a", symbol: "PEPE", entryMarketCap: 80_200, multiple: 12.4, mine: true };

describe("callShareText", () => {
  it("says your own call in the first person, with the move since", () => {
    expect(callShareText(call)).toBe("I called $PEPE at $80.2K mc on Rankr. 12.4x since.");
  });

  it("names someone else's call by their Rankr name, never as an @", () => {
    expect(callShareText({ ...call, mine: false })).toBe("nonce_7f3a called $PEPE at $80.2K mc on Rankr. 12.4x since.");
  });

  it("says a loss as it is", () => {
    expect(callShareText({ ...call, multiple: 0.548 })).toBe("I called $PEPE at $80.2K mc on Rankr. -45.2% since.");
  });

  it("leaves out a move that isn't one yet, and a market cap it doesn't have", () => {
    expect(callShareText({ ...call, multiple: 1.002 })).toBe("I called $PEPE at $80.2K mc on Rankr.");
    expect(callShareText({ ...call, entryMarketCap: null })).toBe("I called $PEPE on Rankr. 12.4x since.");
  });

  it("never says sealed", () => {
    for (const multiple of [12.4, 0.548, 1]) expect(callShareText({ ...call, multiple })).not.toMatch(/seal/i);
  });
});

describe("callCardFile", () => {
  it("names the saved card after the caller and the ticker, safely", () => {
    expect(callCardFile("nonce_7f3a", "PEPE")).toBe("rankr-nonce_7f3a-PEPE.png");
    expect(callCardFile("nonce_7f3a", "WIF/2.0")).toBe("rankr-nonce_7f3a-WIF20.png");
  });
});

describe("callHref", () => {
  it("is the caller's page, then the token", () => {
    expect(callHref("nonce_7f3a", { chainId: "solana", address: "So1ana" })).toBe("/u/nonce_7f3a/solana/So1ana");
    expect(callHref("a", { chainId: "sui", address: "0x2::sui::SUI" })).toBe("/u/a/sui/0x2%3A%3Asui%3A%3ASUI");
  });
});
