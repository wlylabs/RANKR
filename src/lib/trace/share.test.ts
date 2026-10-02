import { describe, expect, it } from "vitest";
import { traceImageFile, traceShareText } from "./share";

const exit = (name: string, hops: number) => ({ address: name, name, kind: "cex" as const, usd: 100, hops });

describe("traceShareText", () => {
  it("says where the money reached, with the hops it took, and nothing more", () => {
    expect(traceShareText("GBER…mTgu", [])).toBe("Following the money from GBER…mTgu on Rankr.");
    expect(traceShareText("GBER…mTgu", [exit("OKX", 1)])).toBe(
      "Following the money from GBER…mTgu on Rankr. It reached OKX.",
    );
    expect(traceShareText("GBER…mTgu", [exit("Binance deposit", 2), exit("OKX", 3), exit("Wormhole", 3)])).toBe(
      "Following the money from GBER…mTgu on Rankr. It reached Binance deposit (2 hops) and OKX.",
    );
  });
});

describe("traceImageFile", () => {
  it("names the file after the wallet, short and safe", () => {
    expect(traceImageFile("GBERKNpahPnBGmeUGWQVjGBDBj6CcJKpGz34FqegmTgu")).toBe("rankr-trace-GBERmTgu.png");
    expect(traceImageFile("0x28C6c06298d514Db089934071355E5743bf21d60")).toBe("rankr-trace-0x281d60.png");
  });
});
