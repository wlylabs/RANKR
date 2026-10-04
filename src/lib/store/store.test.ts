import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { newRecord } from "../metrics";
import type { MarketSnapshot, TokenRecord } from "../types";
import { FileStore } from "./file";
import { queryRecords, staleRecords, statsOfRecords } from "./memory";
import { SupabaseStore, fromRow, toRow } from "./supabase";

const T0 = Date.parse("2026-09-27T05:42:00.123Z");
const H = 3_600_000;

function snap(address: string, priceUsd: number, extra: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    chainId: "solana",
    address,
    name: address,
    symbol: address.toUpperCase(),
    imageUrl: null,
    priceUsd,
    marketCap: priceUsd * 1e9,
    fdv: null,
    liquidityUsd: null,
    volume24h: null,
    priceChange24h: null,
    pairAddress: "pair",
    dexId: "raydium",
    url: "",
    pairCreatedAt: null,
    websites: [],
    socials: [],
    fetchedAt: 0,
    ...extra,
  };
}

function rec(id: string, entry: number, now: number, first: number, patch: Partial<TokenRecord> = {}): TokenRecord {
  const r = newRecord(snap(id.split(":")[1], entry), id, first);
  return { ...r, market: snap(id.split(":")[1], now), ...patch };
}

// Same data as supabase/smoke-test.sql, so both implementations are held to the same answers.
const DATA = [
  rec("solana:AAA", 0.00001234, 0.00002468, T0, { name: "Alpha 100%", symbol: "ALPHA", pasteCount: 2, lowPriceUsd: 0.000006, peakPriceUsd: 0.00002468 }),
  rec("base:0xbbb", 1, 11, T0 - 240 * H, { chainId: "base", address: "0xBBB", name: "Bravo", symbol: "BRAVO", peakPriceUsd: 12 }),
  rec("solana:CCC", 2, 0.2, T0 + 3 * H, { name: "Charlie_x", symbol: "CHAR" }),
];

describe("in-memory query", () => {
  const ids = (extra = {}) => queryRecords(DATA, { limit: 50, offset: 0, ...extra }).records.map((r) => r.id);

  it("lists the newest first paste first, like the SQL function", () => {
    expect(ids()).toEqual(["solana:CCC", "solana:AAA", "base:0xbbb"]);
  });

  it("filters and pages", () => {
    expect(ids({ chain: "solana" })).toEqual(["solana:CCC", "solana:AAA"]);
    expect(ids({ ids: ["solana:CCC", "nope"] })).toEqual(["solana:CCC"]);
    const page = queryRecords(DATA, { limit: 1, offset: 1 });
    expect(page.total).toBe(3);
    expect(page.records.map((r) => r.id)).toEqual(["solana:AAA"]);
  });

  it("refreshes dead tokens less often", () => {
    const checked = (r: TokenRecord, at: number) => ({ ...r, lastCheckedAt: at });
    const records = [checked(DATA[0], T0), checked(DATA[2], T0)]; // AAA alive, CCC dead
    expect(staleRecords(records, T0 + 60_000, 10, T0 - H).map((r) => r.id)).toEqual(["solana:AAA"]);
    expect(staleRecords(records, T0 + 2 * H, 10, T0 + H).map((r) => r.id)).toEqual(["solana:AAA", "solana:CCC"]);
  });

  it("computes stats", () => {
    const s = statsOfRecords(DATA);
    expect(s).toMatchObject({ total: 3, doubled: 2, inRed: 1, chains: ["base", "solana"] });
    expect(s.best?.id).toBe("base:0xbbb");
  });
});

describe("FileStore", () => {
  it("keeps the entry on repeat pastes and moves peak/low outward", async () => {
    const store = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "rankr-")), "t.json"));
    const first = await store.recordPaste(newRecord(snap("AAA", 1), "solana:AAA", T0));
    expect(first.created).toBe(true);

    const again = await store.recordPaste(newRecord(snap("AAA", 3), "solana:AAA", T0 + H));
    expect(again.created).toBe(false);
    expect(again.record).toMatchObject({ pasteCount: 2, entryPriceUsd: 1, firstPastedAt: T0, peakPriceUsd: 3, lastPastedAt: T0 + H });

    await store.applyMarket([{ id: "solana:AAA", snapshot: snap("AAA", 0.5), at: T0 + 2 * H }]);
    const r = await store.get("solana:AAA");
    expect(r).toMatchObject({ peakPriceUsd: 3, lowPriceUsd: 0.5, lowAt: T0 + 2 * H, entryPriceUsd: 1 });
    expect(await store.stale(T0 + 3 * H, 10)).toHaveLength(1);
    expect(await store.stale(T0, 10)).toHaveLength(0);
  });
});

describe("SupabaseStore", () => {
  function mockFetch(body: unknown, status = 200) {
    return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(body === undefined ? "" : JSON.stringify(body), { status }),
    );
  }

  it("round-trips records through rows exactly", () => {
    const r = rec("solana:AAA", 0.00001234, 0.0000987654321, T0);
    expect(fromRow(toRow(r))).toEqual(r);
    expect(toRow(r).first_pasted_at).toBe("2026-09-27T05:42:00.123Z");
    // Postgres renders timestamptz with an offset; that must parse to the same ms.
    expect(fromRow({ ...toRow(r), first_pasted_at: "2026-09-27T05:42:00.123+00:00" }).firstPastedAt).toBe(T0);
  });

  it("sends new secret keys only in apikey, legacy JWT keys in both", async () => {
    const f = mockFetch([]);
    await new SupabaseStore("https://x.supabase.co/", "sb_secret_abc", f).get("solana:A");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/tokens?select=*&id=eq.solana%3AA&limit=1");
    expect(init?.headers).toMatchObject({ apikey: "sb_secret_abc" });
    expect(init?.headers).not.toHaveProperty("authorization");

    const g = mockFetch([]);
    await new SupabaseStore("https://x.supabase.co", "eyJhbGciOi.jwt", g).get("solana:A");
    expect(g.mock.calls[0][1]?.headers).toMatchObject({ apikey: "eyJhbGciOi.jwt", authorization: "Bearer eyJhbGciOi.jwt" });
  });

  it("records a paste through the RPC", async () => {
    const r = rec("solana:AAA", 1, 1, T0);
    const f = mockFetch({ created: true, record: toRow(r) });
    const out = await new SupabaseStore("https://x.supabase.co", "k", f).recordPaste(r);
    expect(out).toEqual({ created: true, record: r });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/rankr_record_paste");
    expect(JSON.parse(String(init?.body))).toEqual({ p: toRow(r) });
  });

  it("maps query arguments and results", async () => {
    const r = rec("solana:AAA", 1, 2, T0);
    const f = mockFetch({ total: 7, records: [{ ...toRow(r), multiple: 2, peak_multiple: 2 }] });
    const page = await new SupabaseStore("https://x.supabase.co", "k", f).query({ chain: "solana", limit: 10, offset: 20 });
    expect(page).toEqual({ total: 7, records: [r] });
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({
      p_sort: "new",
      p_chain: "solana",
      p_ids: null,
      p_limit: 10,
      p_offset: 20,
    });
  });

  it("asks for stale tokens, dead ones by their own cutoff", async () => {
    const f = mockFetch([]);
    await new SupabaseStore("https://x.supabase.co", "k", f).stale(T0, 50, T0 - H);
    const url = decodeURIComponent(String(f.mock.calls[0][0]));
    expect(url).toContain("last_checked_at=lt.2026-09-27T05:42:00.123Z");
    expect(url).toContain("or=(multiple.gt.0.3,last_checked_at.lt.2026-09-27T04:42:00.123Z)");
    expect(url).toContain("order=last_checked_at.asc&limit=50");
  });

  it("surfaces PostgREST errors", async () => {
    const f = mockFetch({ message: "the entry of solana:AAA is sealed" }, 400);
    await expect(new SupabaseStore("https://x.supabase.co", "k", f).stats()).rejects.toThrow(
      "Supabase 400: the entry of solana:AAA is sealed",
    );
  });
});
