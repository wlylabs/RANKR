import { createHash } from "node:crypto";
import { parseInput, tokenId } from "./address";
import { UpstreamError, fetchSnapshots, findToken } from "./dexscreener";
import { applySnapshot, newRecord, toView as statsOf } from "./metrics";
import { store, type MarketUpdate, type TokenQuery } from "./store";
import { compareRecords } from "./store/memory";
import type { TokenRecord, TokenResponse, TokenView, TrackResponse } from "./types";

/** Records younger than this are served as-is. */
const FRESH_MS = 15_000;
/** Cap on tokens refreshed per call (10 DexScreener requests of 30 addresses). */
const MAX_REFRESH = 300;

export class RankrError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Tamper-evident fingerprint of the locked entry. Anyone can recompute it from the
 * public fields, so a changed entry would no longer match its published seal.
 */
export function sealOf(r: Pick<TokenRecord, "chainId" | "address" | "entryPriceUsd" | "firstPastedAt">): string {
  return createHash("sha256")
    .update(`${r.chainId}:${r.address}:${r.entryPriceUsd}:${r.firstPastedAt}`)
    .digest("hex");
}

function toView(r: TokenRecord, now = Date.now()): TokenView {
  return { ...statsOf(r, now), seal: sealOf(r) };
}

async function lookup(address: string, chainHint: string | null) {
  try {
    return await findToken(address, chainHint);
  } catch (err) {
    if (err instanceof UpstreamError) throw new RankrError("Couldn't reach DexScreener. Try again in a moment.", 502);
    throw err;
  }
}

/**
 * Handles a paste. The first paste of a token seals its entry price / market cap;
 * later pastes only bump the paste counter and refresh the live numbers.
 */
export async function trackToken(input: string, chainId?: string): Promise<TrackResponse> {
  const parsed = parseInput(input);
  if (!parsed) throw new RankrError("That doesn't look like a token address or token link.", 400);

  const snap = await lookup(parsed.address, parsed.chainHint ?? chainId ?? null);
  if (!snap || !(snap.priceUsd > 0)) {
    throw new RankrError("No DEX pair with a price found for this address yet.", 404);
  }

  const now = Date.now();
  const { record, created } = await store.recordPaste(newRecord(snap, tokenId(snap.chainId, snap.address), now));
  return { status: created ? "created" : "existing", token: toView(record, now) };
}

// Tokens currently being fetched, so overlapping requests don't refetch them.
const inflight = new Set<string>();

/** Pulls fresh market data for the records that are older than FRESH_MS and saves it. */
async function refresh(records: TokenRecord[]): Promise<TokenRecord[]> {
  const now = Date.now();
  const due = records.filter((r) => now - r.lastCheckedAt > FRESH_MS && !inflight.has(r.id)).slice(0, MAX_REFRESH);
  if (!due.length) return records;

  due.forEach((r) => inflight.add(r.id));
  try {
    const snaps = await fetchSnapshots(due);
    const updates: MarketUpdate[] = due.flatMap((r) => {
      const s = snaps.get(r.id);
      return s && s.priceUsd > 0 ? [{ id: r.id, snapshot: s, at: now }] : [];
    });
    if (!updates.length) return records;
    await store.applyMarket(updates).catch((err) => console.error("[rankr] saving market data failed", err));
    const byId = new Map(updates.map((u) => [u.id, u]));
    return records.map((r) => {
      const u = byId.get(r.id);
      return u ? applySnapshot(r, u.snapshot, u.at) : r;
    });
  } finally {
    due.forEach((r) => inflight.delete(r.id));
  }
}

/** One leaderboard page, with the tokens on it refreshed if their data is old. */
export async function queryTokens(q: TokenQuery): Promise<{ total: number; tokens: TokenView[] }> {
  const page = await store.query(q);
  const fresh = await refresh(page.records);
  const now = Date.now();
  return { total: page.total, tokens: fresh.sort(compareRecords(q.sort)).map((r) => toView(r, now)) };
}

export async function getStats() {
  const s = await store.stats();
  return { total: s.total, doubled: s.doubled, inRed: s.inRed, best: s.best ? toView(s.best) : null, chains: s.chains };
}

/** Background refresh (cron): the stalest tokens first. Returns how many were checked. */
export async function refreshStale(limit = MAX_REFRESH): Promise<number> {
  const records = await store.stale(Date.now() - FRESH_MS, limit);
  await refresh(records);
  return records.length;
}

export async function getToken(chainId: string, address: string): Promise<TokenResponse> {
  const record = await store.get(tokenId(chainId, address));
  if (record) {
    const [fresh] = await refresh([record]);
    return { token: toView(fresh), preview: null };
  }
  const preview = await findToken(address, chainId).catch(() => null);
  return { token: null, preview: preview && preview.priceUsd > 0 ? preview : null };
}
