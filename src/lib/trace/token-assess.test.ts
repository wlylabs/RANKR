import { describe, expect, it } from "vitest";
import type { Pair } from "../dexscreener";
import {
  assessToken,
  clustersOf,
  launchOf,
  washShare,
  flowOf,
  holdersOf,
  tradesOf,
  verdictOf,
  type RawTrade,
  type SolanaContract,
  type TokenFacts,
} from "./token-assess";
import type { TokenCheck } from "./types";

const TOKEN = "MemeMint1111111111111111111111111111111111";
const POOL = "Pool11111111111111111111111111111111111111";
const NOW = Date.UTC(2026, 9, 1);

const pair = (extra: Partial<Pair> = {}): Pair => ({
  chainId: "solana",
  dexId: "pumpswap",
  url: "https://dexscreener.com/solana/pool",
  pairAddress: POOL,
  baseToken: { address: TOKEN, name: "Meme", symbol: "MEME" },
  quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
  priceUsd: "0.0001",
  liquidity: { usd: 80_000 },
  marketCap: 1_000_000,
  pairCreatedAt: NOW - 86_400_000,
  txns: { m5: { buys: 4, sells: 2 }, h1: { buys: 40, sells: 30 }, h6: { buys: 200, sells: 150 }, h24: { buys: 900, sells: 700 } },
  volume: { m5: 1_000, h1: 9_000, h6: 50_000, h24: 200_000 },
  ...extra,
});

const clean: SolanaContract = {
  kind: "solana",
  token2022: false,
  mintAuthority: null,
  freezeAuthority: null,
  transferFeeBps: null,
  feeAuthority: null,
  permanentDelegate: null,
  transferHook: null,
  nonTransferable: false,
  defaultFrozen: false,
  pausable: null,
};

/** A crowd of wallets, each buying or selling once: nothing odd in it. */
const crowd = (n: number): RawTrade[] =>
  Array.from({ length: n }, (_, i) => ({
    wallet: `W${i}`,
    side: i % 3 === 0 ? "sell" : "buy",
    usd: 50 + (i % 7) * 30,
    time: NOW - i * 60_000,
    tx: `tx${i}`,
  }));

const holders = (shares: number[], extra: TokenFacts["holders"] extends infer H ? Partial<NonNullable<H>> : never = {}) => ({
  supply: 1_000,
  count: null,
  list: [
    { address: POOL, amount: 300, role: "pool" as const, label: null },
    ...shares.map((s, i) => ({ address: `H${i}`, amount: s * 10, role: null, label: null })),
  ],
  ...extra,
});

const facts = (extra: Partial<TokenFacts> = {}): TokenFacts => ({
  chain: "solana",
  address: TOKEN,
  pairs: [pair()],
  pool: { "24h": { buys: 900, sells: 700, buyers: 500, sellers: 400 } },
  trades: crowd(60),
  holders: holders([5, 4, 3, 2, 2, 1, 1, 1, 1, 1]),
  contract: clean,
  creator: null,
  label: () => null,
  now: NOW,
  ...extra,
});

const statusOf = (checks: TokenCheck[], id: string) => checks.find((c) => c.id === id)?.status;

describe("flowOf", () => {
  it("sums every pool's buys, sells and volume per window; wallets come from the main pool", () => {
    const flow = flowOf([pair(), pair({ pairAddress: "Other", volume: { h24: 50_000 } })], {
      "1h": { buys: 40, sells: 30, buyers: 25, sellers: 20 },
    });
    expect(flow.map((f) => f.window)).toEqual(["5m", "1h", "6h", "24h"]);
    expect(flow[1]).toEqual({ window: "1h", buys: 80, sells: 60, buyers: 25, sellers: 20, volumeUsd: 9_000 });
    expect(flow[3].volumeUsd).toBe(250_000);
    expect(flow[0].buyers).toBeNull();
  });
});

describe("tradesOf", () => {
  it("ranks wallets by what they bought or sold, net of the other side", () => {
    const t = tradesOf(
      POOL,
      [
        { wallet: "A", side: "buy", usd: 500, time: 3, tx: "1" },
        { wallet: "A", side: "sell", usd: 100, time: 4, tx: "2" },
        { wallet: "B", side: "buy", usd: 900, time: 5, tx: "3" },
        { wallet: "C", side: "sell", usd: 700, time: 1, tx: "4" },
        { wallet: "D", side: "buy", usd: 200, time: 2, tx: "5" },
        { wallet: "D", side: "sell", usd: 200, time: 6, tx: "6" },
      ],
      () => null,
    )!;
    expect(t.buyers.map((w) => [w.address, w.buyUsd - w.sellUsd])).toEqual([
      ["B", 900],
      ["A", 400],
    ]);
    expect(t.sellers.map((w) => w.address)).toEqual(["C"]);
    expect(t).toMatchObject({ count: 6, from: 1, to: 6, buyUsd: 1_600, sellUsd: 1_000, wallets: 4 });
  });
});

describe("holdersOf", () => {
  it("leaves pools, burn addresses and exchanges out of the top 10's share, and marks the deployer", () => {
    const h = holdersOf(
      {
        supply: 1_000,
        count: 42,
        list: [
          { address: POOL, amount: 400, role: "pool", label: null },
          { address: "Burn", amount: 100, role: "burn", label: null },
          { address: "Cex", amount: 90, role: null, label: { kind: "cex", name: "Binance", source: "x" } },
          { address: "Dev", amount: 60, role: null, label: null },
          { address: "Whale", amount: 50, role: null, label: null },
        ],
      },
      "Dev",
    );
    expect(h.top.map((x) => [x.address, x.pct, x.role])).toEqual([
      [POOL, 40, "pool"],
      ["Burn", 10, "burn"],
      ["Cex", 9, null],
      ["Dev", 6, "creator"],
      ["Whale", 5, null],
    ]);
    expect(h.top10Pct).toBe(11);
    expect(h.poolPct).toBe(40);
    expect(h.count).toBe(42);
  });
});

describe("washShare", () => {
  const w = (buys: number, sells: number, buyUsd: number, sellUsd: number, bought = 0, sold = 0) => ({
    address: "x",
    label: null,
    buys,
    sells,
    buyUsd,
    sellUsd,
    last: 0,
    bought,
    sold,
    amounts: bought > 0,
  });
  it("counts wallets buying and selling the same amount of the token, within 2%, twice or more each way", () => {
    // 600 of 1,000 dollars of volume: the wallet trading the same 1,000 tokens back and forth.
    expect(washShare([w(2, 2, 300, 300, 1_000, 990), w(1, 0, 400, 0, 50, 0)])).toBe(60);
    // 5% apart in tokens: a trader, not a wash.
    expect(washShare([w(2, 2, 300, 300, 1_000, 950)])).toBe(0);
    // In and out once is a trade, not a wash.
    expect(washShare([w(1, 1, 300, 300, 1_000, 1_000)])).toBe(0);
  });
  it("goes by dollars, within 10%, when the trades carry no token amounts", () => {
    expect(washShare([w(3, 3, 300, 290)])).toBe(100);
    expect(washShare([w(3, 3, 900, 100)])).toBe(0);
  });
});

describe("launchOf", () => {
  const top = holdersOf({ supply: 1_000, count: null, list: [{ address: "Dev", amount: 10, role: null, label: null }] }, "Dev");
  it("splits the first buys into a bundle, snipers and the deployer's own, as shares of the supply", () => {
    const l = launchOf(
      {
        reached: true,
        at: 5,
        creator: "Dev",
        buys: [
          { wallet: "Dev", amount: 100, phase: "bundle" },
          { wallet: "A", amount: 150, phase: "bundle" },
          { wallet: "B", amount: 150, phase: "bundle" },
          { wallet: "C", amount: 50, phase: "sniper" },
        ],
      },
      1_000,
      "Dev",
      top,
    );
    expect(l).toEqual({
      at: 5,
      bundle: { wallets: 2, pct: 30 },
      snipers: { wallets: 1, pct: 5 },
      dev: { boughtPct: 10, holdsPct: 1 },
    });
  });
});

describe("clustersOf", () => {
  const h = holdersOf(
    {
      supply: 100,
      count: null,
      list: ["A", "B", "C", "D", "E", "Dev"].map((address, i) => ({ address, amount: 10 - i, role: null, label: null })),
    },
    "Dev",
  );
  const cex = (a: string) => (a === "Binance" ? { kind: "cex" as const, name: "Binance", source: "x" } : null);
  it("groups holders sharing a funder, and holders the deployer funded; an exchange funds no one in particular", () => {
    const c = clustersOf(
      h,
      [
        { holder: "A", funder: "F" },
        { holder: "B", funder: "F" },
        { holder: "C", funder: "Binance" },
        { holder: "D", funder: "Binance" },
        { holder: "E", funder: "Dev" },
        { holder: "Dev", funder: null },
      ],
      "Dev",
      cex,
    );
    expect(c.map((x) => [x.funder, x.deployer, x.pct, x.members.map((m) => m.address)])).toEqual([
      ["F", false, 19, ["A", "B"]],
      ["Dev", true, 11, ["E", "Dev"]],
    ]);
  });
  it("doesn't count the deployer alone as a group", () => {
    expect(clustersOf(h, [{ holder: "Dev", funder: "Z" }], "Dev", () => null)).toEqual([]);
  });
});

describe("assessToken", () => {
  it("finds nothing wrong with a clean token", () => {
    const r = assessToken(facts());
    expect(r.verdict).toBe("clear");
    expect(r.checks.every((c) => c.status === "ok")).toBe(true);
    expect(r).toMatchObject({ name: "Meme", symbol: "MEME", marketCap: 1_000_000, liquidityUsd: 80_000, pools: 1 });
    expect(r.pool).toMatchObject({ address: POOL, dex: "pumpswap" });
  });

  it("calls an active freeze or mint authority a warning sign", () => {
    const r = assessToken(facts({ contract: { ...clean, freezeAuthority: "Freezer", mintAuthority: "Minter" } }));
    expect(r.verdict).toBe("danger");
    expect(statusOf(r.checks, "freeze")).toBe("bad");
    expect(statusOf(r.checks, "mint")).toBe("bad");
    // Warning signs come first.
    expect(r.checks[0].status).toBe("bad");
  });

  it("reads Token-2022's extras: fees, a permanent delegate, a hook", () => {
    const r = assessToken(
      facts({ contract: { ...clean, token2022: true, transferFeeBps: 300, feeAuthority: "A", transferHook: "Hook" } }),
    );
    expect(r.checks.find((c) => c.id === "fee")).toMatchObject({
      status: "warn",
      text: "Transfer fee of 3.0% on every transfer, and it can be raised",
    });
    expect(statusOf(r.checks, "hook")).toBe("warn");
    expect(r.verdict).toBe("check");
    expect(statusOf(assessToken(facts({ contract: { ...clean, permanentDelegate: "D" } })).checks, "delegate")).toBe(
      "bad",
    );
  });

  it("says a token is worth a closer look when part of it couldn't be read", () => {
    const r = assessToken(facts({ contract: null, holders: null, trades: null }));
    expect(r.verdict).toBe("check");
    expect(r.checks.filter((c) => c.status === "unknown").map((c) => c.id)).toEqual(["contract", "holders", "trades"]);
  });

  it("weighs holders: a concentrated top 10, one big wallet", () => {
    const r = assessToken(facts({ holders: holders([25, 10, 8, 6, 5, 4, 2, 1, 1, 1]) }));
    expect(statusOf(r.checks, "top10")).toBe("bad");
    expect(r.checks.find((c) => c.id === "largest")).toMatchObject({ status: "bad", text: "One wallet holds 25%" });
  });

  it("flags wash trading and a few big sells into many small buys", () => {
    const churn: RawTrade[] = Array.from({ length: 40 }, (_, i) => ({
      wallet: `Bot${i % 4}`,
      side: i % 8 < 4 ? "buy" : "sell",
      usd: 1_000,
      time: NOW - i * 1_000,
      tx: `c${i}`,
    }));
    const r = assessToken(facts({ trades: [...churn, ...crowd(20)] }));
    expect(statusOf(r.checks, "wash")).toBe("bad");

    const dump: RawTrade[] = [
      ...Array.from({ length: 30 }, (_, i) => ({ wallet: `B${i}`, side: "buy" as const, usd: 50, time: i, tx: `b${i}` })),
      ...Array.from({ length: 4 }, (_, i) => ({ wallet: `S${i}`, side: "sell" as const, usd: 2_000, time: i, tx: `s${i}` })),
    ];
    expect(assessToken(facts({ trades: dump })).checks.find((c) => c.id === "dumping")).toMatchObject({
      status: "warn",
      text: "Many small buys, a few big sells: 30 buys for $1.5K, 4 sells for $8.0K",
    });
  });

  it("calls many trades per wallet bots, and too few trades too few to judge", () => {
    const bots = assessToken(facts({ pool: { "24h": { buys: 900, sells: 700, buyers: 120, sellers: 100 } } }));
    expect(statusOf(bots.checks, "bots")).toBe("warn");
    const quiet = assessToken(facts({ trades: crowd(5) }));
    expect(quiet.checks.find((c) => c.id === "trades")?.text).toBe("Only 5 trades lately: too few to judge");
  });

  it("on EVM: a failed test sell, taxes, unverified code, liquidity that can be pulled, the deployer's share", () => {
    const evm = (contract: TokenFacts["contract"], extra: Partial<TokenFacts> = {}) =>
      assessToken(facts({ chain: "ethereum", contract, ...extra }));
    const sim = { honeypot: false, reason: null, buyTax: 0, sellTax: 0, transferTax: 0 };
    const ok = { kind: "evm" as const, verified: true, proxy: false, scam: false, sim };

    expect(evm(ok, { lp: { burnedPct: 100, lockedPct: 0 } }).verdict).toBe("clear");
    expect(evm({ ...ok, sim: { ...sim, honeypot: true, reason: "transfer reverted" } }).checks[0]).toMatchObject({
      id: "sell",
      status: "bad",
      text: "Can't be sold: a test sell failed (transfer reverted)",
    });
    expect(evm({ ...ok, sim: { ...sim, sellTax: 15 } }).checks.find((c) => c.id === "tax")).toMatchObject({
      status: "bad",
      text: "Tax: 0.0% to buy, 15% to sell",
    });
    expect(statusOf(evm({ ...ok, verified: false }).checks, "source")).toBe("warn");
    // No sell test on this chain: it can't be called clean.
    expect(evm({ ...ok, sim: undefined }).verdict).toBe("check");
    expect(statusOf(evm(ok, { lp: { burnedPct: 10, lockedPct: 20 } }).checks, "lp")).toBe("bad");
    expect(statusOf(evm(ok, { lp: { burnedPct: 60, lockedPct: 20 } }).checks, "lp")).toBe("warn");

    const dev = evm(ok, { creator: "H0", holders: holders([25, 4, 3]) });
    expect(dev.checks.find((c) => c.id === "creator")).toMatchObject({
      status: "bad",
      text: "The deployer still holds 25%",
    });
    expect(dev.holders?.top.find((h) => h.address === "H0")?.role).toBe("creator");
  });

  it("reads the launch: a big bundle is a warning sign, a deployer that sold its launch buy worth a look", () => {
    const r = assessToken(
      facts({
        supply: 1_000,
        launch: {
          reached: true,
          at: NOW,
          creator: "Dev",
          buys: [
            { wallet: "Dev", amount: 50, phase: "bundle" },
            { wallet: "X", amount: 200, phase: "bundle" },
            { wallet: "Y", amount: 150, phase: "bundle" },
            { wallet: "Z", amount: 250, phase: "sniper" },
          ],
        },
      }),
    );
    expect(r.creator).toBe("Dev");
    expect(r.checks.find((c) => c.id === "bundle")).toMatchObject({ status: "bad", short: "35% bundled" });
    expect(statusOf(r.checks, "snipers")).toBe("warn");
    // Bought 5%, and isn't among the biggest holders (the smallest holds 3%... of 1,000: it can't hold 5% now).
    expect(r.checks.find((c) => c.id === "devsold")).toMatchObject({ status: "warn", short: "Deployer sold" });
    expect(r.verdict).toBe("danger");
  });

  it("notes a launch it couldn't reach, without counting it", () => {
    const r = assessToken(facts({ launch: { reached: false } }));
    expect(r.notes.map((n) => n.text)).toContain("Its launch is too far back to read: it has traded a lot since.");
    expect(r.verdict).toBe("clear");
  });

  it("calls a big group of top holders funded by one wallet a warning sign", () => {
    const r = assessToken(
      facts({
        links: ["H0", "H1", "H2", "H3"].map((holder) => ({ holder, funder: "Same" })),
        holders: holders([12, 10, 8, 6, 2, 1, 1, 1, 1, 1]),
      }),
    );
    expect(r.checks.find((c) => c.id === "cluster")).toMatchObject({ status: "bad", short: "Linked wallets: 36%" });
    expect(r.clusters[0].members).toHaveLength(4);
    expect(r.holders?.top.find((h) => h.address === "H0")?.cluster).toBe(0);
  });

  it("on Solana, flags metadata that can still be changed", () => {
    const r = assessToken(facts({ contract: { ...clean, mutableMetadata: true } }));
    expect(r.checks.find((c) => c.id === "metadata")).toMatchObject({ status: "warn", short: "Name can change" });
  });

  it("on EVM: what the owner can still do, the deployer's other tokens, few holders", () => {
    const sim = { honeypot: false, reason: null, buyTax: 0, sellTax: 0, transferTax: 0 };
    const base = { kind: "evm" as const, verified: true, proxy: false, scam: false, sim };
    const evm = (extra: Partial<TokenFacts>) => assessToken(facts({ chain: "base", ...extra }));
    const renounced = evm({ contract: { ...base, owner: "renounced", powers: ["mint", "fees"] } });
    expect(renounced.checks.filter((c) => c.id.startsWith("power:"))).toEqual([]);
    expect(statusOf(renounced.checks, "owner")).toBe("ok");
    const owned = evm({ contract: { ...base, owner: "0xowner", powers: ["mint", "fees"] } });
    expect(statusOf(owned.checks, "power:mint")).toBe("bad");
    expect(statusOf(owned.checks, "power:fees")).toBe("warn");
    // No owner() to say who holds the admin functions: worth a look.
    expect(statusOf(evm({ contract: { ...base, owner: "none", powers: ["blacklist"] } }).checks, "power:blacklist")).toBe(
      "warn",
    );
    expect(evm({ contract: { ...base, owner: "0xowner", powers: [] } }).checks.find((c) => c.id === "owner")?.status).toBe(
      "ok",
    );
    expect(evm({ contract: base, history: { tokens: 6, dead: 4 } }).checks.find((c) => c.id === "history")).toMatchObject({
      status: "bad",
      text: "The deployer launched 6 other tokens; 4 are dead",
    });
    expect(statusOf(evm({ contract: base, holders: { ...holders([1]), count: 40 } }).checks, "count")).toBe("warn");
  });

  it("thin liquidity is worth a look; no pool is unknown", () => {
    expect(statusOf(assessToken(facts({ pairs: [pair({ liquidity: { usd: 3_000 } })] })).checks, "liquidity")).toBe(
      "warn",
    );
    const curve = assessToken(facts({ pairs: [pair({ dexId: "pumpfun", liquidity: undefined })] }));
    expect(curve.checks.find((c) => c.id === "liquidity")).toMatchObject({ status: "ok" });
    expect(curve.liquidityUsd).toBeNull();
    const unreported = assessToken(facts({ pairs: [pair({ dexId: "raydium", liquidity: undefined })] }));
    expect(statusOf(unreported.checks, "liquidity")).toBe("unknown");
    const none = assessToken(facts({ pairs: [], trades: null, pool: null }));
    expect(none.checks.find((c) => c.id === "pools")?.text).toBe("No DEX pool trades it yet");
    expect(none.pool).toBeNull();
    expect(none.trades).toBeNull();
  });
});

describe("verdictOf", () => {
  const c = (status: TokenCheck["status"]): TokenCheck => ({
    id: "x",
    group: "contract",
    status,
    short: "",
    text: "",
    source: "",
  });
  it("is a warning sign with one bad check, worth a look with a warn or unknown one, clear otherwise", () => {
    expect(verdictOf([c("ok"), c("bad"), c("warn")])).toBe("danger");
    expect(verdictOf([c("ok"), c("unknown")])).toBe("check");
    expect(verdictOf([c("ok"), c("ok")])).toBe("clear");
  });
});
