import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pair } from "../dexscreener";
import { traceChain } from "./chains";
import { poolTrades, poolWindows } from "./gecko";
import { simulateTrade } from "./honeypot";
import { evmTokenFacts } from "./token-evm";
import { base58Decode } from "./solana-pda";
import type { ParsedTx } from "./solana";
import { lpMintOf, readLaunch, readMint, solanaTokenFacts, tokenDeltas } from "./token-solana";
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

describe("a Solana token's launch and pool", () => {
  /** A swap of MEME: each owner's balance before and after. */
  const swap = (sig: string, slot: number, changes: [string, number, number][], dex = true): ParsedTx => ({
    slot,
    blockTime: 1_790_000_000 + slot,
    meta: {
      err: null,
      preTokenBalances: changes.map(([owner, before], i) => ({
        accountIndex: i,
        mint: MINT,
        owner,
        uiTokenAmount: { amount: String(before * 1e6), decimals: 6 },
      })),
      postTokenBalances: changes.map(([owner, , after], i) => ({
        accountIndex: i,
        mint: MINT,
        owner,
        uiTokenAmount: { amount: String(after * 1e6), decimals: 6 },
      })),
    },
    transaction: {
      signatures: [sig],
      message: { accountKeys: [`payer-${sig}`], instructions: dex ? [{ programId: PUMP }] : [] },
    },
  });

  it("follows each wallet's change in the token over a transaction", () => {
    const d = tokenDeltas(swap("a", 1, [["Curve", 900, 800], ["Buyer", 0, 100]]), MINT, 6);
    expect(Object.fromEntries(d)).toEqual({ Curve: -100, Buyer: 100 });
  });

  it("finds the launch, its bundle and its snipers; the curve filling up isn't a buyer", () => {
    const txs = [
      // The deployer creates it: the curve gets the supply, the deployer its first buy, a bundled wallet too.
      swap("create", 10, [["Curve", 0, 900], ["Dev", 0, 50], ["Bundler", 0, 50]]),
      swap("snipe", 12, [["Curve", 900, 880], ["Sniper", 0, 20]]),
      swap("late", 30, [["Curve", 880, 870], ["Late", 0, 10]]),
    ].map((tx) => ({ tx, slot: tx.slot!, time: (tx.blockTime ?? 0) * 1000 }));
    const l = readLaunch(txs, MINT, 6, 1_000, () => false);
    expect(l).toEqual({
      reached: true,
      at: 1_790_000_010_000,
      creator: "payer-create",
      buys: [
        { wallet: "Dev", amount: 50, phase: "bundle" },
        { wallet: "Bundler", amount: 50, phase: "bundle" },
        { wallet: "Sniper", amount: 20, phase: "sniper" },
      ],
    });
  });

  it("reads a pool account's LP mint only where the pool's own mints check out", () => {
    const data = new Uint8Array(752);
    const put = (at: number, key: string) => data.set(base58Decode(key), at);
    const LP = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    put(400, BONK);
    put(432, WSOL);
    put(464, LP);
    const V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
    expect(lpMintOf(V4, data, BONK)).toBe(LP);
    // Not this token's pool, or a layout this doesn't know: nothing read.
    expect(lpMintOf(V4, data, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBeNull();
    expect(lpMintOf("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", data, BONK)).toBeNull();
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
  const BUNDLER = "0x5555555555555555555555555555555555555555";
  const SNIPER = "0x6666666666666666666666666666666666666666";
  const OLD = "0x7777777777777777777777777777777777777777";
  beforeEach(() => vi.stubEnv("BLOCKSCOUT_API_KEY", "test-key"));

  it("reads the contract, the holders, a test sell, the LP, the launch, the owner's powers and the deployer's tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
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
        if (url.includes("publicnode")) {
          expect(JSON.parse(String(init?.body)).params[0]).toEqual({ to: TOKEN, data: "0x8da5cb5b" });
          return Response.json({ result: `0x${"0".repeat(24)}${DEV.slice(2)}` });
        }
        if (url.includes("/v2/api?")) {
          const q = new URL(url).searchParams;
          expect([q.get("action"), q.get("address"), q.get("contractaddress"), q.get("sort")]).toEqual([
            "tokentx",
            PAIR,
            TOKEN,
            "asc",
          ]);
          const t = (block: number, from: string, to: string, value: string) => ({
            blockNumber: String(block),
            timeStamp: "1790000000",
            from,
            to,
            value,
            tokenDecimal: "18",
          });
          return Response.json({
            status: "1",
            result: [
              t(100, DEV, PAIR, "600000000000000000000"), // the liquidity going in
              t(101, PAIR, BUNDLER, "200000000000000000000"),
              t(101, PAIR, DEV, "50000000000000000000"),
              t(103, PAIR, SNIPER, "30000000000000000000"),
              t(200, PAIR, "0x9999999999999999999999999999999999999999", "1000000000000000000"),
            ],
          });
        }
        if (path === `/smart-contracts/${TOKEN}`)
          return Response.json({
            abi: [
              { type: "function", name: "setTaxes", stateMutability: "nonpayable" },
              { type: "function", name: "openTrading", stateMutability: "nonpayable" },
              { type: "function", name: "balanceOf", stateMutability: "view" },
            ],
          });
        if (path === `/addresses/${DEV}`) return Response.json({ hash: DEV, is_contract: false });
        if (path === `/addresses/${DEV}/transactions`)
          return Response.json({ items: [{ created_contract: { hash: OLD } }, { created_contract: null }], next_page_params: null });
        if (path === `/tokens/${OLD}`) return Response.json({ type: "ERC-20" });
        if (url.includes("dexscreener")) return Response.json([]);
        if (path.endsWith("/internal-transactions")) return Response.json({ items: [], next_page_params: null });
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
      owner: DEV,
      // openTrading is a one-way switch, not a pause.
      powers: ["fees"],
    });
    expect(f.launch).toEqual({
      reached: true,
      at: 1_790_000_000_000,
      buys: [
        { wallet: BUNDLER, amount: 200, phase: "bundle" },
        { wallet: DEV, amount: 50, phase: "bundle" },
        { wallet: SNIPER, amount: 30, phase: "sniper" },
      ],
    });
    // The old token has no pool left: dead.
    expect(f.history).toEqual({ tokens: 1, dead: 1 });
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
