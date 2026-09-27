import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketSnapshot, TokenView } from "./types";

// A localStorage for the node test run.
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const snap = { chainId: "base", address: EVM, symbol: "ZED", name: "Zed", priceUsd: 0.5, marketCap: 500_000, fdv: 600_000 } as MarketSnapshot;
const view = {
  id: "solana:AAA",
  chainId: "solana",
  address: "AAA",
  symbol: "ALPHA",
  name: "Alpha",
  entryPriceUsd: 2,
  entryMarketCap: 2_000,
  firstPastedAt: 1_000,
  multiple: 1.5,
  marketCap: 3_000,
  market: null,
  seal: "x",
} as unknown as TokenView;

describe("watchlist", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    vi.resetModules();
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  });

  it("saves a token at its price now, for tokens on Rankr and ones that aren't", async () => {
    const { watchedFrom } = await import("./watchlist");
    expect(watchedFrom(snap, 42)).toEqual({
      id: `base:${EVM.toLowerCase()}`,
      chainId: "base",
      address: EVM,
      symbol: "ZED",
      name: "Zed",
      priceUsd: 0.5,
      marketCap: 500_000,
      at: 42,
    });
    expect(watchedFrom(view, 42)).toMatchObject({ id: "solana:AAA", priceUsd: 3, marketCap: 3_000 });
  });

  it("adds newest first, once, and removes", async () => {
    const { unwatch, watch, watchedFrom } = await import("./watchlist");
    const read = () => JSON.parse(storage.getItem("rankr:watch:v2")!).map((w: { id: string }) => w.id);
    watch(watchedFrom(view, 1));
    watch(watchedFrom(snap, 2));
    watch(watchedFrom(view, 3));
    expect(read()).toEqual([`base:${EVM.toLowerCase()}`, "solana:AAA"]);
    unwatch("solana:AAA");
    expect(read()).toEqual([`base:${EVM.toLowerCase()}`]);
  });

  it("brings over stars from before, then measures them from the first paste", async () => {
    storage.setItem("rankr:watch:v1", JSON.stringify(["solana:AAA", "nonsense"]));
    const { settle, watch, watchedFrom } = await import("./watchlist");
    watch(watchedFrom(snap, 5)); // reads (and migrates) first
    const list = JSON.parse(storage.getItem("rankr:watch:v2")!);
    expect(list[1]).toEqual({ id: "solana:AAA", chainId: "solana", address: "AAA", symbol: "", name: "", priceUsd: null, marketCap: null, at: 0 });
    expect(list).toHaveLength(2);
    expect(storage.getItem("rankr:watch:v1")).toBeNull();

    settle("solana:AAA", view);
    expect(JSON.parse(storage.getItem("rankr:watch:v2")!)[1]).toMatchObject({ symbol: "ALPHA", priceUsd: 2, marketCap: 2_000, at: 1_000 });
  });
});
