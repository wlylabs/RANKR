import { describe, expect, it } from "vitest";
import { callHref } from "./format";
import { callCardFile, callShareText, paperCardFile, paperCardQuery, paperShareText, parsePaperCard, tickerLine, type PaperCard } from "./share";

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

const trade: PaperCard = { kind: "trade", symbol: "PEPE", chainId: "solana", open: false, multiple: 2.4, amounts: null };
const wallet: PaperCard = { kind: "wallet", tickers: ["PEPE", "WIF", "DOGE"], tokens: 5, trades: 7, multiple: 1.24, amounts: null };

describe("paperShareText", () => {
  it("says it as the card does, with the move", () => {
    expect(paperShareText(trade)).toBe("Traded $PEPE on Rankr: 2.40x.");
    expect(paperShareText({ ...trade, open: true, multiple: 0.548 })).toBe("Holding $PEPE on Rankr: -45.2% so far.");
    expect(paperShareText(wallet)).toBe("Trading $PEPE $WIF $DOGE +2 on Rankr: +24.0%.");
    expect(paperShareText({ ...wallet, tickers: [], tokens: 0, multiple: 1.001 })).toBe("Trading on Rankr.");
  });
});

describe("paperCardFile", () => {
  it("names the saved card after the ticker, or the portfolio", () => {
    expect(paperCardFile({ ...trade, symbol: "WIF/2.0" })).toBe("rankr-pnl-WIF20.png");
    expect(paperCardFile(wallet)).toBe("rankr-pnl-portfolio.png");
  });
});

describe("paper card query", () => {
  const read = (card: PaperCard) => parsePaperCard(new URLSearchParams(paperCardQuery(card)));

  it("reads back the card it was written from", () => {
    expect(read(trade)).toEqual(trade);
    expect(read({ ...trade, open: true })).toEqual({ ...trade, open: true });
    expect(read(wallet)).toEqual(wallet);
    const amounts = { inUsd: 100, backUsd: 240, currency: "idr" as const, usdIdr: 16_400 };
    expect(read({ ...trade, amounts })).toEqual({ ...trade, amounts });
  });

  it("leaves the amounts out of the query unless they're on the card", () => {
    expect(paperCardQuery(trade)).not.toMatch(/[?&]?(a|b|r)=/);
  });

  it("takes the move from the amounts when they're on it", () => {
    expect(parsePaperCard(new URLSearchParams("k=t&s=PEPE&c=solana&x=50&a=100&b=50"))?.multiple).toBe(0.5);
  });

  it("refuses what a card can't say", () => {
    const bad = [
      "k=t&s=PEPE&c=solana", // no move
      "k=t&s=PEPE&c=solana&x=-1",
      "k=t&s=PEPE&c=solana&x=Infinity",
      "k=t&s=&c=solana&x=2",
      "k=t&s=PEPE&c=So%20lana&x=2",
      "k=t&s=PEPE&c=solana&x=2&a=100", // half the amounts
      "k=t&s=PEPE&c=solana&x=2&a=100&b=200&r=0",
      "k=w&x=2&n=1.5&m=1",
      "k=w&x=2&n=3&m=1&t=PEPE,WIF", // fewer tokens than it names
      "k=z&x=2",
    ];
    for (const q of bad) expect(parsePaperCard(new URLSearchParams(q)), q).toBeNull();
  });

  it("names a portfolio by its first few tickers, counting the rest", () => {
    expect(tickerLine(["PEPE", "WIF"], 2)).toBe("$PEPE $WIF");
    expect(tickerLine(["PEPE", "WIF", "DOGE", "BONK"], 6)).toBe("$PEPE $WIF $DOGE +3");
    const card = parsePaperCard(new URLSearchParams("k=w&x=2&n=9&m=6&t=PEPE,W<i>F,,DOGE,BONK"));
    expect(card?.kind === "wallet" && card.tickers).toEqual(["PEPE", "WiF", "DOGE"]);
  });

  it("keeps a ticker short and plain", () => {
    const card = parsePaperCard(new URLSearchParams("k=t&s=<b>PEPE</b> to the moon forever&c=solana&x=2"));
    expect(card?.kind === "trade" && card.symbol).toBe("bPEPEbtothemoonf");
  });
});
