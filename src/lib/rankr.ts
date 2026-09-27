import { createHash } from "node:crypto";
import { parseInput, tokenId } from "./address";
import { UpstreamError, fetchSnapshots, findToken } from "./dexscreener";
import { applySnapshot, newRecord, toView as statsOf } from "./metrics";
import { store } from "./store";
import type { TokenRecord, TokenResponse, TokenView, TrackResponse } from "./types";

/** Records younger than this are served as-is. */
const FRESH_MS = 15_000;
/** Cap on tokens refreshed per request (10 DexScreener calls); the stalest go first. */
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
 * Handles a paste. The first paste of a token locks its entry price / market cap;
 * later pastes only bump the paste counter and refresh the live numbers.
 */
export async function trackToken(input: string, chainId?: string): Promise<TrackResponse> {
  const parsed = parseInput(input);
  if (!parsed) throw new RankrError("That doesn't look like a token address or token link.", 400);

  const snap = await lookup(parsed.address, parsed.chainHint ?? chainId ?? null);
  if (!snap || !(snap.priceUsd > 0)) {
    throw new RankrError("No DEX pair with a price found for this address yet.", 404);
  }

  const id = tokenId(snap.chainId, snap.address);
  const now = Date.now();
  let current = await store.get(id);
  if (!current) {
    const record = newRecord(snap, id, now);
    if (await store.create(record)) return { status: "created", token: toView(record, now) };
    current = await store.get(id); // lost a race with a simultaneous paste
    if (!current) throw new RankrError("Could not save this token, try again.", 500);
  }

  const updated: TokenRecord = {
    ...applySnapshot(current, snap, now),
    pasteCount: current.pasteCount + 1,
    lastPastedAt: now,
  };
  await store.save([updated]);
  return { status: "existing", token: toView(updated, now) };
}

async function refresh(records: TokenRecord[]): Promise<TokenRecord[]> {
  const now = Date.now();
  const due = records
    .filter((r) => now - r.lastCheckedAt > FRESH_MS)
    .sort((a, b) => a.lastCheckedAt - b.lastCheckedAt)
    .slice(0, MAX_REFRESH);
  if (!due.length) return records;

  const snaps = await fetchSnapshots(due);
  const updated = due.flatMap((r) => {
    const s = snaps.get(r.id);
    return s && s.priceUsd > 0 ? [applySnapshot(r, s, now)] : [];
  });
  await store.save(updated);
  const byId = new Map(updated.map((r) => [r.id, r]));
  return records.map((r) => byId.get(r.id) ?? r);
}

// Concurrent list requests share one refresh instead of each hitting DexScreener.
let listing: Promise<TokenView[]> | null = null;

export function listTokens(): Promise<TokenView[]> {
  listing ??= (async () => {
    const records = await refresh(await store.list());
    const now = Date.now();
    return records.map((r) => toView(r, now));
  })().finally(() => {
    listing = null;
  });
  return listing;
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
