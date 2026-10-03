import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBudgets } from "../budget";
import { traceChain } from "./chains";
import { blockscoutLabel, evmHoldings, summarizeHoldings, traceEvm, units } from "./evm";

const W = "0x1111111111111111111111111111111111111111";
const BINANCE_14 = "0x28C6c06298d514Db089934071355E5743bf21d60";
const TORNADO_1ETH = "0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc";
const ROUTER = "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af";
const POOL = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640";
const SPAMMER = "0x2222222222222222222222222222222222222222";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const at = (day: number) => `2026-09-${String(day).padStart(2, "0")}T00:00:00.000000Z`;
const addr = (hash: string, extra: object = {}) => ({ hash, is_contract: false, name: null, ...extra });

describe("units", () => {
  it("reads integer strings with their decimals", () => {
    expect(units("1500000000000000000", 18)).toBe(1.5);
    expect(units("5", 18)).toBe(5e-18);
    expect(units("2500000", 6)).toBe(2.5);
    expect(units("42", 0)).toBe(42);
    expect(units("not a number", 18)).toBe(0);
  });
});

describe("blockscoutLabel", () => {
  it("tells scams, exchanges, contracts, smart wallets and plain names apart", () => {
    expect(blockscoutLabel(addr(W, { is_scam: true }))?.kind).toBe("scam");
    expect(blockscoutLabel(addr(W, { metadata: { tags: [{ name: "Binance 14", tagType: "name" }] } }))).toMatchObject({
      kind: "cex",
      name: "Binance 14",
    });
    expect(blockscoutLabel(addr(ROUTER, { is_contract: true, name: "UniversalRouter" }))).toMatchObject({
      kind: "contract",
      name: "UniversalRouter",
    });
    expect(blockscoutLabel(addr(W, { is_contract: true, name: "GnosisSafeProxy" }))?.kind).toBe("named");
    expect(blockscoutLabel(addr(W, { is_contract: true, name: "L1StandardBridge" }))?.kind).toBe("bridge");
    expect(blockscoutLabel(addr(W, { ens_domain_name: "someone.eth" }))).toMatchObject({
      kind: "named",
      name: "someone.eth",
    });
    expect(blockscoutLabel(addr(W))).toBeNull();
    // A cross-chain aggregator in front of bridges counts as one: its money left the chain.
    expect(blockscoutLabel(addr(W, { is_contract: true, metadata: { tags: [{ name: "LI.FI: Permit2 Proxy 2" }] } })))
      .toMatchObject({ kind: "bridge", name: "LI.FI: Permit2 Proxy 2" });
    expect(blockscoutLabel(addr(W, { is_contract: true, name: "GelatoRelayer" }))?.kind).toBe("contract");
  });
});

describe("traceEvm", () => {
  const ethereum = traceChain("ethereum")!;
  beforeEach(() => vi.stubEnv("BLOCKSCOUT_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("needs a key", async () => {
    vi.stubEnv("BLOCKSCOUT_API_KEY", "");
    await expect(traceEvm(ethereum, W)).rejects.toMatchObject({ code: "nokey" });
  });

  it("reads the wallet's lists: funding, a mixer, a swap set aside, airdropped spam left out", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(url);
        expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-key");
        const path = new URL(url).pathname;
        if (path.endsWith("/transactions")) {
          return Response.json({
            items: [
              {
                hash: "0xt3",
                timestamp: at(3),
                status: "ok",
                value: "200000000000000000",
                exchange_rate: "2500",
                from: addr(W),
                to: addr(ROUTER, { is_contract: true, name: "UniversalRouter" }),
              },
              {
                hash: "0xt2",
                timestamp: at(2),
                status: "ok",
                value: "500000000000000000",
                exchange_rate: "2500",
                from: addr(W),
                to: addr(TORNADO_1ETH, { is_contract: true, name: "ETHTornado" }),
              },
              {
                hash: "0xtx",
                timestamp: at(2),
                status: "error",
                value: "9000000000000000000",
                from: addr(W),
                to: addr(SPAMMER),
              },
              {
                hash: "0xt1",
                timestamp: at(1),
                status: "ok",
                value: "1000000000000000000",
                exchange_rate: "2500",
                from: addr(BINANCE_14),
                to: addr(W),
              },
            ],
            next_page_params: null,
          });
        }
        if (path.endsWith("/token-transfers")) {
          return Response.json({
            items: [
              {
                transaction_hash: "0xt3",
                timestamp: at(3),
                token_type: "ERC-20",
                from: addr(POOL, { is_contract: true }),
                to: addr(W),
                total: { value: "490000000", decimals: "6" },
                token: { address_hash: USDC, symbol: "USDC", exchange_rate: "1" },
              },
              {
                transaction_hash: "0xt4",
                timestamp: at(4),
                token_type: "ERC-20",
                from: addr(SPAMMER),
                to: addr(W),
                total: { value: "1000000", decimals: "6" },
                token: { address_hash: SPAMMER, symbol: "USDT", exchange_rate: null },
              },
            ],
            next_page_params: null,
          });
        }
        if (path.endsWith("/internal-transactions")) return Response.json({ items: [], next_page_params: null });
        return Response.json({
          hash: W,
          is_contract: false,
          coin_balance: "300000000000000000",
          exchange_rate: "2500",
        });
      }),
    );

    const t = await traceEvm(ethereum, W);
    expect(urls).toContain(`https://api.blockscout.com/1/api/v2/addresses/${W}/token-transfers?type=ERC-20`);
    expect(t.funder).toMatchObject({
      address: BINANCE_14,
      label: { kind: "cex", name: "Binance" },
      terminal: true,
      usd: 2500,
    });
    expect(t.outflows.map((f) => [f.address, f.label?.kind, f.terminal, f.usd])).toEqual([
      [TORNADO_1ETH, "mixer", true, 1250],
    ]);
    expect(t.inflows.map((f) => f.address)).toEqual([BINANCE_14]);
    expect(t.swaps).toEqual({ txs: 1, usd: 500 });
    expect(t.balance).toEqual({ symbol: "ETH", amount: 0.3, usd: 750 });
    expect(t.scanned.complete).toBe(true);
    expect(t.firstSeen).toBe(Date.parse(at(1)));
  });

  it("turns down a token's address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ hash: USDC, is_contract: true, token: { symbol: "USDC" }, items: [], next_page_params: null }),
      ),
    );
    await expect(traceEvm(ethereum, USDC)).rejects.toMatchObject({ code: "token" });
  });
});

describe("summarizeHoldings", () => {
  const bal = (symbol: string, value: string, decimals: string, rate: string | null, extra: object = {}) => ({
    value,
    token: { address_hash: USDC, symbol, decimals, exchange_rate: rate, ...extra },
  });

  it("sums the priced tokens, biggest first, leaving out scams and unpriced airdrops", () => {
    const h = summarizeHoldings(
      [
        bal("PEPE", "1000000000000000000000000", "18", "0.00001"),
        bal("USDC", "30000000000", "6", "1"),
        bal("LINK", "10000000000000000000", "18", "12"),
        bal("WETH", "1000000000000000000", "18", "2500"),
        bal("FAKE", "1000000", "6", "1", { reputation: "scam" }),
        bal("AIRDROP", "1000000", "6", null),
      ],
      false,
    );
    expect(h.count).toBe(4);
    expect(h.usd).toBeCloseTo(30000 + 2500 + 120 + 10);
    expect(h.top.map((t) => t.symbol)).toEqual(["USDC", "WETH", "LINK"]);
    expect(h.partial).toBe(false);
  });
});

describe("evmHoldings", () => {
  const ethereum = traceChain("ethereum")!;
  beforeEach(() => {
    vi.stubEnv("BLOCKSCOUT_API_KEY", "test-key");
    resetBudgets();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetBudgets();
  });

  it("reads the first page of tokens, one request", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        items: [{ value: "30000000000", token: { address_hash: USDC, symbol: "USDC", decimals: "6", exchange_rate: "1" } }],
        next_page_params: { items_count: 50 },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const h = await evmHoldings(ethereum, W);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([
      `https://api.blockscout.com/1/api/v2/addresses/${W}/tokens?type=ERC-20`,
      expect.anything(),
    ]);
    expect(h).toMatchObject({ usd: 30000, count: 1, partial: true });
  });

  it("stops at its own daily budget, before Blockscout's runs short", async () => {
    vi.stubEnv("BLOCKSCOUT_HOLDINGS_DAILY_CREDITS", "40");
    // A day of its own: the counters outlive the other tests' reads.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2030, 0, 1));
    const fetch = vi.fn(async () => Response.json({ items: [], next_page_params: null }));
    vi.stubGlobal("fetch", fetch);
    expect(await evmHoldings(ethereum, W)).toMatchObject({ count: 0 });
    expect(await evmHoldings(ethereum, W)).toMatchObject({ count: 0 });
    expect(await evmHoldings(ethereum, W)).toBe("budget");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("says nothing without a key", async () => {
    vi.stubEnv("BLOCKSCOUT_API_KEY", "");
    expect(await evmHoldings(ethereum, W)).toBeNull();
  });
});
