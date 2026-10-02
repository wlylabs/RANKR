import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pair } from "../dexscreener";
import { traceChain } from "./chains";
import { poolTrades, poolWindows } from "./gecko";
import { simulateTrade } from "./honeypot";
import { evmTokenFacts } from "./token-evm";
import { readMint, solanaTokenFacts } from "./token-solana";
import { traceToken } from "./token";

const MINT = "MemeMint1111111111111111111111111111111111";
const POOL = "Pool11111111111111111111111111111111111111";
const WSOL = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const pair = (address: string, pairAddress: string, chainId = "solana"): Pair => ({
  chainId,
  dexId: "raydium",
  url: `https://dexscreener.com/${chainId}/${pairAddress}`,
  pairAddress,
  baseToken: { address, name: "Meme", symbol: "MEME" },
  quoteToken: { address: WSOL, name: "Wrapped SOL", symbol: "SOL" },
  priceUsd: "0.001",
  liquidity: { usd: 50_000 },
  marketCap: 900_000,
  txns: { h24: { buys: 10, sells: 5 } },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GeckoTerminal", () => {
  it("reads buys and sells from the trade's tokens, whichever way the pool is set up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("/networks/solana/pools/");
        const trade = (from: string, to: string, kind: string, wallet: string) => ({
          attributes: {
            tx_hash: `${wallet}-tx`,
            tx_from_address: wallet,
            kind,
            volume_in_usd: "125.5",
            block_timestamp: "2026-10-01T10:00:00Z",
            from_token_address: from,
            to_token_address: to,
          },
        });
        // A pool GeckoTerminal sets up as SOL/MEME: its "buy" is buying SOL, so selling MEME.
        return Response.json({
          data: [trade(WSOL, MINT, "sell", "Buyer"), trade(MINT, WSOL, "buy", "Seller"), trade(WSOL, "Other", "buy", "X")],
        });
      }),
    );
    expect(await poolTrades("solana", POOL, MINT)).toEqual([
      { wallet: "Buyer", side: "buy", usd: 125.5, time: Date.parse("2026-10-01T10:00:00Z"), tx: "Buyer-tx" },
      { wallet: "Seller", side: "sell", usd: 125.5, time: Date.parse("2026-10-01T10:00:00Z"), tx: "Seller-tx" },
    ]);
  });

  it("reads the pool's counts with wallets, on GeckoTerminal's own network ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("/networks/polygon_pos/pools/0xpool");
        return Response.json({
          data: { attributes: { transactions: { h1: { buys: 5, sells: 3, buyers: 4, sellers: 2 } } } },
        });
      }),
    );
    expect(await poolWindows("polygon", "0xpool")).toEqual({ "1h": { buys: 5, sells: 3, buyers: 4, sellers: 2 } });
  });
});

describe("Honeypot.is", () => {
  it("isn't asked on a chain it doesn't simulate", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await simulateTrade("arbitrum", "0xabc")).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the test sell and the taxes; a failed simulation is unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("chainID=8453");
        return Response.json({
          simulationSuccess: true,
          honeypotResult: { isHoneypot: false },
          simulationResult: { buyTax: 1, sellTax: 4.5, transferTax: 0 },
        });
      }),
    );
    expect(await simulateTrade("base", "0xabc", "0xpair")).toEqual({
      honeypot: false,
      reason: null,
      buyTax: 1,
      sellTax: 4.5,
      transferTax: 0,
    });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ simulationSuccess: false })));
    expect(await simulateTrade("ethereum", "0xabc")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 502 })));
    expect(await simulateTrade("ethereum", "0xabc")).toBeNull();
  });
});

describe("a Solana token", () => {
  it("reads the mint's authorities and Token-2022 extensions", () => {
    const c = readMint("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", {
      decimals: 6,
      supply: "1000",
      mintAuthority: null,
      freezeAuthority: "Freezer",
      extensions: [
        {
          extension: "transferFeeConfig",
          state: {
            transferFeeConfigAuthority: "FeeBoss",
            olderTransferFee: { transferFeeBasisPoints: 100 },
            newerTransferFee: { transferFeeBasisPoints: 250 },
          },
        },
        { extension: "permanentDelegate", state: { delegate: "Delegate" } },
        { extension: "defaultAccountState", state: { accountState: "frozen" } },
        { extension: "metadataPointer", state: {} },
      ],
    });
    expect(c).toEqual({
      kind: "solana",
      token2022: true,
      mintAuthority: null,
      freezeAuthority: "Freezer",
      transferFeeBps: 250,
      feeAuthority: "FeeBoss",
      permanentDelegate: "Delegate",
      transferHook: null,
      nonTransferable: false,
      defaultFrozen: true,
      pausable: null,
    });
  });

  it("follows the biggest token accounts to their owners: a pool's vault, a burn, a wallet with two accounts", async () => {
    const accounts: Record<string, string> = { ta1: "Curve", ta2: "Whale", ta3: "Whale", ta4: "1nc1nerator11111111111111111111111111111111", ta5: POOL };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const { method, params } = JSON.parse(String(init?.body));
        if (method === "getAccountInfo") {
          return Response.json({
            result: {
              value: {
                owner: TOKEN_PROGRAM,
                data: { parsed: { type: "mint", info: { decimals: 2, supply: "100000", mintAuthority: null, freezeAuthority: null } } },
              },
            },
          });
        }
        if (method === "getTokenLargestAccounts") {
          return Response.json({
            result: {
              value: [
                { address: "ta1", amount: "40000" },
                { address: "ta2", amount: "10000" },
                { address: "ta3", amount: "5000" },
                { address: "ta4", amount: "3000" },
                { address: "ta5", amount: "2000" },
              ],
            },
          });
        }
        if (method === "getMultipleAccounts" && params[1].encoding === "jsonParsed") {
          return Response.json({
            result: { value: params[0].map((a: string) => ({ owner: TOKEN_PROGRAM, data: { parsed: { info: { owner: accounts[a] } } } })) },
          });
        }
        if (method === "getMultipleAccounts") {
          // The bonding curve belongs to pump.fun's program; the wallet to the system program.
          return Response.json({
            result: { value: params[0].map((o: string) => (o === "Curve" ? { owner: PUMP, data: [] } : { owner: "11111111111111111111111111111111", data: [] })) },
          });
        }
        throw new Error(`unexpected ${method}`);
      }),
    );
    const f = await solanaTokenFacts(MINT, [pair(MINT, POOL)], new Map([["Whale", "Binance"]]));
    expect(f.contract).toMatchObject({ kind: "solana", mintAuthority: null, freezeAuthority: null });
    expect(f.holders?.supply).toBe(1000);
    expect(f.holders?.list.map((h) => [h.address, h.amount, h.role, h.label?.name ?? null])).toEqual([
      ["Curve", 400, "pool", null],
      ["Whale", 150, null, "Binance deposit"],
      ["1nc1nerator11111111111111111111111111111111", 30, "burn", null],
      [POOL, 20, "pool", null],
    ]);
  });

  it("keeps the report when the holders can't be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const { method } = JSON.parse(String(init?.body));
        if (method === "getAccountInfo") {
          return Response.json({
            result: { value: { owner: TOKEN_PROGRAM, data: { parsed: { type: "mint", info: { decimals: 0, supply: "5", mintAuthority: "M" } } } } },
          });
        }
        return Response.json({ error: { code: -32010, message: "excluded from account secondary indexes" } });
      }),
    );
    const f = await solanaTokenFacts(MINT, [], new Map());
    expect(f.holders).toBeNull();
    expect(f.contract).toMatchObject({ mintAuthority: "M" });
  });
});

describe("an EVM token", () => {
  const base = traceChain("base")!;
  const TOKEN = "0x1111111111111111111111111111111111111111";
  const PAIR = "0x2222222222222222222222222222222222222222";
  const DEV = "0x3333333333333333333333333333333333333333";
  const LOCKER = "0x4444444444444444444444444444444444444444";
  beforeEach(() => vi.stubEnv("BLOCKSCOUT_API_KEY", "test-key"));

  it("reads the contract, the holders, a test sell and who holds the LP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("honeypot.is"))
          return Response.json({ simulationSuccess: true, honeypotResult: { isHoneypot: false }, simulationResult: { buyTax: 0, sellTax: 0, transferTax: 0 } });
        const path = new URL(url).pathname.replace("/8453/api/v2", "");
        if (path === `/addresses/${TOKEN}`)
          return Response.json({ hash: TOKEN, is_contract: true, is_verified: true, creator_address_hash: DEV, token: { type: "ERC-20" } });
        if (path === `/tokens/${TOKEN}`)
          return Response.json({ name: "Meme", symbol: "MEME", type: "ERC-20", decimals: "18", total_supply: "1000000000000000000000", holders_count: "321" });
        if (path === `/tokens/${TOKEN}/holders`)
          return Response.json({
            items: [
              { address: { hash: PAIR, is_contract: true, name: "UniswapV2Pair" }, value: "500000000000000000000" },
              { address: { hash: DEV, is_contract: false }, value: "120000000000000000000" },
              { address: { hash: "0x000000000000000000000000000000000000dEaD", is_contract: false }, value: "50000000000000000000" },
            ],
            next_page_params: null,
          });
        if (path === `/tokens/${PAIR}`) return Response.json({ type: "ERC-20", decimals: "18", total_supply: "100" });
        if (path === `/tokens/${PAIR}/holders`)
          return Response.json({
            items: [
              { address: { hash: "0x0000000000000000000000000000000000000000", is_contract: false }, value: "60" },
              { address: { hash: LOCKER, is_contract: true, name: "UNCX_ProofOfReservesV2_UniV2" }, value: "30" },
              { address: { hash: DEV, is_contract: false }, value: "10" },
            ],
            next_page_params: null,
          });
        throw new Error(`unexpected ${url}`);
      }),
    );
    const f = await evmTokenFacts(base, TOKEN, [pair(TOKEN, PAIR, "base")]);
    expect(f.creator).toBe(DEV);
    expect(f.contract).toEqual({
      kind: "evm",
      verified: true,
      proxy: false,
      scam: false,
      sim: { honeypot: false, reason: null, buyTax: 0, sellTax: 0, transferTax: 0 },
    });
    expect(f.lp).toEqual({ burnedPct: 60, lockedPct: 30 });
    expect(f.holders?.count).toBe(321);
    expect(f.holders?.list.map((h) => [h.address, h.amount, h.role])).toEqual([
      [PAIR, 500, "pool"],
      [DEV, 120, "creator"],
      ["0x000000000000000000000000000000000000dEaD", 50, "burn"],
    ]);
  });
});

describe("traceToken", () => {
  it("puts DexScreener, GeckoTerminal and the chain together into one report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("dexscreener")) return Response.json([pair(MINT, POOL)]);
        if (url.includes("githubusercontent")) return new Response("");
        if (url.includes("geckoterminal") && url.endsWith("/trades")) return Response.json({ data: [] });
        if (url.includes("geckoterminal")) return Response.json({ data: { attributes: { transactions: {} } } });
        const { method } = JSON.parse(String(init?.body));
        if (method === "getAccountInfo") {
          return Response.json({
            result: { value: { owner: TOKEN_PROGRAM, data: { parsed: { type: "mint", info: { decimals: 0, supply: "100", freezeAuthority: "F" } } } } },
          });
        }
        if (method === "getTokenLargestAccounts") return Response.json({ result: { value: [] } });
        throw new Error(`unexpected ${method}`);
      }),
    );
    const r = await traceToken("solana", MINT);
    expect(r).toMatchObject({ chain: "solana", address: MINT, symbol: "MEME", verdict: "danger", pools: 1 });
    expect(r.checks[0]).toMatchObject({ id: "freeze", status: "bad" });
    expect(r.flow.find((w) => w.window === "24h")).toMatchObject({ buys: 10, sells: 5 });
  });

  it("turns down a chain it doesn't read", async () => {
    await expect(traceToken("bsc", "0x1111111111111111111111111111111111111111")).rejects.toMatchObject({
      code: "unsupported",
    });
  });
});
