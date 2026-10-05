// Accounts' own Trace keys: read, checked and saved (encrypted, secret-box.ts) in trace_keys. Server only. See
// trace/keys.ts for how a read runs on them.
import { canSeal, open, seal } from "./secret-box";
import { SupabaseRest, supabaseConfig } from "./supabase-rest";
import { heliusUrl, type OwnKeys } from "./trace/keys";
import type { TraceKeysResponse } from "./types";

let client: SupabaseRest | null | undefined;
function rest(): SupabaseRest | null {
  if (client === undefined) {
    const cfg = supabaseConfig();
    client = cfg ? new SupabaseRest(cfg.url, cfg.key) : null;
  }
  return client;
}

/** Keys can be saved here: accounts are set up, and there's a secret to encrypt them with. */
export const keysStorable = () => rest() !== null && canSeal();

type Row = { blockscout: string | null; helius: string | null };

// Read for a minute, so each of a trail's requests doesn't go to Postgres (saving here forgets it at once).
const cache = new Map<string, { keys: OwnKeys; until: number }>();

/** The account's own keys (null for one it hasn't added, or one that can't be read any more). */
export async function loadKeys(userId: string): Promise<OwnKeys> {
  const hit = cache.get(userId);
  if (hit && hit.until > Date.now()) return hit.keys;
  const api = rest();
  const rows = api
    ? await api.select<Row[]>(`trace_keys?select=blockscout,helius&user_id=eq.${encodeURIComponent(userId)}&limit=1`)
    : [];
  const keys: OwnKeys = { userId, blockscout: open(rows[0]?.blockscout), helius: open(rows[0]?.helius) };
  if (cache.size > 5_000) cache.clear();
  cache.set(userId, { keys, until: Date.now() + 60_000 });
  return keys;
}

/** The end of a key, enough to tell which one it is: "…a1b2". */
const hint = (key: string | null) => (key ? `…${key.slice(-4)}` : null);

export async function keysView(userId: string, official: boolean): Promise<TraceKeysResponse> {
  const storable = keysStorable();
  const keys = storable ? await loadKeys(userId) : null;
  return { official, storable, blockscout: hint(keys?.blockscout ?? null), helius: hint(keys?.helius ?? null) };
}

/** A Helius API key, pasted alone or in its RPC URL (…helius-rpc.com/?api-key=…); null if it isn't one. */
export function parseHelius(input: string): string | null {
  const s = input.trim();
  let key = s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      if (!/(^|\.)helius-rpc\.com$/i.test(url.hostname)) return null;
      key = url.searchParams.get("api-key") ?? "";
    } catch {
      return null;
    }
  }
  return /^[A-Za-z0-9-]{16,64}$/.test(key) ? key : null;
}

/** A Blockscout API key: one token, no spaces; null if it can't be one. */
export function parseBlockscout(input: string): string | null {
  const s = input.trim();
  return /^[A-Za-z0-9_.-]{8,128}$/.test(s) ? s : null;
}

const blockscoutApi = () => (process.env.BLOCKSCOUT_API_URL ?? "https://api.blockscout.com").replace(/\/+$/, "");

/**
 * Whether the provider turns the key down (401/403): false then. Anything else (it answered, or couldn't be
 * reached) counts as fine: the key is saved, and a read on it says what's wrong if anything is.
 */
async function accepted(req: () => Promise<Response>): Promise<boolean> {
  try {
    const res = await req();
    return res.status !== 401 && res.status !== 403;
  } catch {
    return true;
  }
}

export const checkHelius = (key: string, fetchImpl: typeof fetch = fetch) =>
  accepted(() =>
    fetchImpl(heliusUrl(key), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    }),
  );

export const checkBlockscout = (key: string, fetchImpl: typeof fetch = fetch) =>
  accepted(() =>
    fetchImpl(`${blockscoutApi()}/1/api/v2/stats`, {
      headers: { accept: "application/json", authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    }),
  );

/** A change: a key (as pasted), null to remove it, left out to keep it. */
export type KeysChange = { blockscout?: string | null; helius?: string | null };

/**
 * Checks and saves the account's keys. Each one pasted must look like its provider's and not be turned down by
 * it. Returns what's saved now, or why not.
 */
export async function saveKeys(
  userId: string,
  change: KeysChange,
  check = { helius: checkHelius, blockscout: checkBlockscout },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const api = rest();
  if (!api || !canSeal()) return { ok: false, error: "Saving keys isn't set up on this site.", status: 501 };
  const now = await loadKeys(userId);
  const next = { blockscout: now.blockscout, helius: now.helius };

  if (typeof change.helius === "string") {
    const key = parseHelius(change.helius);
    if (!key) return { ok: false, error: "That isn't a Helius API key. Copy it from dashboard.helius.dev.", status: 400 };
    if (!(await check.helius(key))) return { ok: false, error: "Helius turned that key down. Check it and try again.", status: 400 };
    next.helius = key;
  } else if (change.helius === null) next.helius = null;

  if (typeof change.blockscout === "string") {
    const key = parseBlockscout(change.blockscout);
    if (!key)
      return { ok: false, error: "That isn't a Blockscout API key. Copy it from dev.blockscout.com.", status: 400 };
    if (!(await check.blockscout(key)))
      return { ok: false, error: "Blockscout turned that key down. Check it and try again.", status: 400 };
    next.blockscout = key;
  } else if (change.blockscout === null) next.blockscout = null;

  await api.rpc("rankr_set_trace_keys", {
    p_user: userId,
    p_blockscout: next.blockscout ? seal(next.blockscout) : null,
    p_helius: next.helius ? seal(next.helius) : null,
  });
  cache.delete(userId);
  return { ok: true };
}
