import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTransaction, traceSolana, walletLegs, type ParsedTx } from "./solana";

// Real-looking jsonParsed transactions (the shape getTransaction returns with encoding "jsonParsed").
const W = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const FRIEND = "3vZ67CubA5Grnn2qpfjVFXCsq3x9rv4Q8kJ7RgTd2kQD";
const PAYER = "Fz6LxeUg5qjesYX3BdmtTwyyzBtMxk644XiTqU5W3w9w";
const BINANCE_HOT = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
const DEPOSIT = "D3pos1tWa11etB1nanceExchangeUserAcc0untXyz1";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MEME = "MemeM1ntPumpXyzAbcdefghijkmnopqrstuvwxyz123";

const solTransfer = (source: string, destination: string, lamports: number) => ({
  program: "system",
  programId: "11111111111111111111111111111111",
  parsed: { type: "transfer", info: { source, destination, lamports } },
});

function tx(
  sig: string,
  blockTime: number,
  opts: Partial<{ keys: string[]; ixs: unknown[]; inner: unknown[]; balances: unknown[] }>,
): ParsedTx {
  return {
    blockTime,
    meta: {
      err: null,
      innerInstructions: opts.inner ? [{ index: 0, instructions: opts.inner as never }] : [],
      preTokenBalances: (opts.balances as never) ?? [],
      postTokenBalances: (opts.balances as never) ?? [],
    },
    transaction: {
      signatures: [sig],
      message: {
        accountKeys: (opts.keys ?? [W]).map((pubkey) => ({ pubkey })),
        instructions: (opts.ixs as never) ?? [],
      },
    },
  };
}

describe("parseTransaction", () => {
  it("reads SOL out and a token in, following the token account to its owner", () => {
    const t = tx("sig1", 1_790_000_000, {
      keys: [W, FRIEND, "TaW", "TaPayer", TOKEN],
      ixs: [solTransfer(W, FRIEND, 1_500_000_000)],
      inner: [
        {
          program: "spl-token",
          programId: TOKEN,
          // A plain "transfer" carries no mint: it comes from the token balances.
          parsed: {
            type: "transfer",
            info: { source: "TaPayer", destination: "TaW", amount: "2500000", authority: PAYER },
          },
        },
      ],
      balances: [
        { accountIndex: 2, mint: USDC, owner: W, uiTokenAmount: { decimals: 6 } },
        { accountIndex: 3, mint: USDC, owner: PAYER, uiTokenAmount: { decimals: 6 } },
      ],
    });
    const { legs, programs } = parseTransaction(t, W);
    expect(legs).toEqual([
      {
        tx: "sig1",
        time: 1_790_000_000_000,
        dir: "out",
        counterparty: FRIEND,
        asset: "native",
        amount: 1.5,
        native: true,
      },
      { tx: "sig1", time: 1_790_000_000_000, dir: "in", counterparty: PAYER, asset: USDC, amount: 2.5, native: false },
    ]);
    expect(programs.has(TOKEN)).toBe(true);
  });

  it("counts wrapped SOL as SOL, and skips transfers that aren't the wallet's", () => {
    const t = tx("sig2", 1_790_000_000, {
      keys: [W, "TaW", "TaFriend", "TaA", "TaB"],
      ixs: [
        {
          program: "spl-token",
          programId: TOKEN,
          parsed: {
            type: "transferChecked",
            info: {
              source: "TaW",
              destination: "TaFriend",
              mint: WSOL,
              authority: W,
              tokenAmount: { uiAmountString: "0.25", decimals: 9 },
            },
          },
        },
        solTransfer(FRIEND, PAYER, 9_000_000_000),
      ],
      balances: [
        { accountIndex: 1, mint: WSOL, owner: W, uiTokenAmount: { decimals: 9 } },
        { accountIndex: 2, mint: WSOL, owner: FRIEND, uiTokenAmount: { decimals: 9 } },
      ],
    });
    expect(parseTransaction(t, W).legs).toEqual([
      {
        tx: "sig2",
        time: 1_790_000_000_000,
        dir: "out",
        counterparty: FRIEND,
        asset: "native",
        amount: 0.25,
        native: true,
      },
    ]);
  });
});

describe("walletLegs", () => {
  const swapAndSend = (signer: string) =>
    tx("s", 1_790_000_000, {
      keys: [signer, "TaW", "TaPool", JUPITER],
      ixs: [{ programId: JUPITER, accounts: [] }],
      inner: [
        {
          program: "spl-token",
          programId: TOKEN,
          parsed: {
            type: "transfer",
            info: { source: "TaPool", destination: "TaW", amount: "1000000", authority: "PoolAuth" },
          },
        },
      ],
      balances: [
        { accountIndex: 1, mint: USDC, owner: W, uiTokenAmount: { decimals: 6 } },
        { accountIndex: 2, mint: USDC, owner: "PoolAuth", uiTokenAmount: { decimals: 6 } },
      ],
    });

  it("reads someone else's swap that pays the wallet as a payment from the signer", () => {
    const { legs, swap } = walletLegs(swapAndSend(FRIEND), W);
    expect(swap).toBe(false);
    expect(legs.map((l) => [l.dir, l.counterparty, l.amount])).toEqual([["in", FRIEND, 1]]);
  });

  it("reads the wallet's own trade on a DEX as a swap", () => {
    expect(walletLegs(swapAndSend(W), W).swap).toBe(true);
  });
});

describe("traceSolana", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds who funded the wallet, names exchanges, and sums trades instead of drawing them", async () => {
    const txs: Record<string, ParsedTx> = {
      // Oldest: Binance's hot wallet sends 20 SOL, the wallet's first money.
      s1: tx("s1", 1_790_000_000, { keys: [BINANCE_HOT, W], ixs: [solTransfer(BINANCE_HOT, W, 20e9)] }),
      s2: tx("s2", 1_790_000_100, { keys: [W, FRIEND], ixs: [solTransfer(W, FRIEND, 3e9)] }),
      // To an exchange deposit wallet: cashed out.
      s3: tx("s3", 1_790_000_200, { keys: [W, DEPOSIT], ixs: [solTransfer(W, DEPOSIT, 10e9)] }),
      // A Jupiter swap: SOL out to a pool, a memecoin back. Not a counterparty.
      s4: tx("s4", 1_790_000_300, {
        keys: [W, "PoolVault", "TaW", "TaPool", JUPITER],
        ixs: [{ programId: JUPITER, accounts: [] }],
        inner: [
          solTransfer(W, "PoolVault", 2e9),
          {
            program: "spl-token",
            programId: TOKEN,
            parsed: {
              type: "transfer",
              info: { source: "TaPool", destination: "TaW", amount: "5000000", authority: "PoolAuth" },
            },
          },
        ],
        balances: [
          { accountIndex: 2, mint: MEME, owner: W, uiTokenAmount: { decimals: 6 } },
          { accountIndex: 3, mint: MEME, owner: "PoolAuth", uiTokenAmount: { decimals: 6 } },
        ],
      }),
    };
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("dexscreener")) {
          return Response.json([
            {
              chainId: "solana",
              dexId: "raydium",
              url: "",
              pairAddress: "p",
              baseToken: { address: WSOL, name: "Wrapped SOL", symbol: "SOL" },
              quoteToken: { address: USDC, name: "USDC", symbol: "USDC" },
              priceUsd: "150",
              liquidity: { usd: 1e7 },
            },
          ]);
        }
        if (url.includes("githubusercontent")) {
          return new Response(
            `ADDRESS,LABEL_TYPE,LABEL_SUBTYPE,ADDRESS_NAME,PROJECT_NAME\n${DEPOSIT},cex,deposit_wallet,binance deposit_wallet,binance\n`,
          );
        }
        const { method, params } = JSON.parse(String(init?.body));
        calls.push(method);
        if (method === "getAccountInfo") {
          return Response.json({
            result: {
              value: {
                lamports: 5e9,
                owner: "11111111111111111111111111111111",
                executable: false,
                data: ["", "base64"],
              },
            },
          });
        }
        if (method === "getSignaturesForAddress") {
          return Response.json({
            result: ["s4", "s3", "s2", "s1"].map((signature, i) => ({
              signature,
              err: null,
              blockTime: 1_790_000_300 - i * 100,
            })),
          });
        }
        if (method === "getTransaction") return Response.json({ result: txs[params[0]] });
        throw new Error(`unexpected ${method}`);
      }),
    );

    const t = await traceSolana(W);
    expect(calls.filter((m) => m === "getTransaction")).toHaveLength(4);
    expect(t.funder).toMatchObject({
      address: BINANCE_HOT,
      label: { kind: "cex", name: "Binance" },
      terminal: true,
      usd: 3000,
    });
    expect(t.firstSeen).toBe(1_790_000_000_000);
    expect(t.inflows.map((f) => f.address)).toEqual([BINANCE_HOT]);
    expect(t.outflows.map((f) => [f.address, f.label?.name ?? null, f.terminal, f.usd])).toEqual([
      [DEPOSIT, "Binance deposit", true, 1500],
      [FRIEND, null, false, 450],
    ]);
    expect(t.swaps).toEqual({ txs: 1, usd: 300 });
    expect(t.balance).toEqual({ symbol: "SOL", amount: 5, usd: 750 });
    expect(t.scanned).toMatchObject({ txs: 4, complete: true });
  });

  it("turns down a token's address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("githubusercontent")) return new Response("");
        const { method } = JSON.parse(String(init?.body));
        if (method === "getAccountInfo") {
          return Response.json({
            result: { value: { lamports: 1, owner: TOKEN, executable: false, data: { parsed: { type: "mint" } } } },
          });
        }
        return Response.json({ result: [] });
      }),
    );
    await expect(traceSolana(MEME)).rejects.toMatchObject({ code: "token" });
  });
});
