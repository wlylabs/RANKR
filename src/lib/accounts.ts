// Accounts (Supabase Auth: one-click guests that can save a sign-in key) with a public username, and
// per-user calls. Server only.
import { callerStats } from "./caller-stats";
import { generateKey, isKeyEmail, keyEmail } from "./key";
import { MIN_CALLS_RANKED, type CallerSort } from "./params";
import { parsePostId, xCode, type ProfileFields } from "./profile";
import { viewsOf } from "./rankr";
import { fromRow, type TokenRow } from "./store/supabase";
import { SupabaseRest, supabaseConfig } from "./supabase-rest";
import type { CallView, CallerAbout, CallerView, FeedItem, Season, TokenView } from "./types";
import { checkUsername, type UsernameProblem } from "./username";
import { readPost, type Post } from "./x-post";

/**
 * A signed-in user. New accounts get a default name (e.g. nonce_7f3a) they can change. Every account starts
 * as a guest (anonymous sign-in) that lives in one browser; `hasKey` once it has a key to sign in anywhere.
 * `official` accounts (set by the project owner, see rankr_set_official) show a check badge and keep their name.
 * `about`: bio and links (src/lib/profile.ts).
 */
export type Account = { id: string; username: string | null; hasKey: boolean; official: boolean; about: CallerAbout };

type ProfileRow = {
  user_id: string;
  username: string;
  official?: boolean;
  bio?: string | null;
  x_handle?: string | null;
  x_verified_at?: string | null;
  telegram?: string | null;
  website?: string | null;
};

// Columns are read with select=*, so profiles work (without bio and links) before …_rankr_profile.sql has run.
function aboutOf(row: Partial<ProfileRow> | undefined): CallerAbout {
  return {
    bio: row?.bio ?? null,
    x: row?.x_handle ?? null,
    xVerified: !!row?.x_verified_at,
    telegram: row?.telegram ?? null,
    website: row?.website ?? null,
  };
}

export class AuthError extends Error {}

let client: SupabaseRest | null | undefined;
function rest(): SupabaseRest | null {
  if (client === undefined) {
    const cfg = supabaseConfig();
    client = cfg ? new SupabaseRest(cfg.url, cfg.key) : null;
  }
  return client;
}

export function accountsEnabled(): boolean {
  return rest() !== null;
}

// Verified tokens for a minute, so every request doesn't round-trip to Supabase Auth.
const verified = new Map<string, { account: Account; until: number }>();

function forget(userId: string) {
  for (const [token, hit] of verified) if (hit.account.id === userId) verified.delete(token);
}

/**
 * The user behind `Authorization: Bearer <supabase access token>`, or null when the request has
 * no token. Throws AuthError when a token is sent but isn't valid.
 */
export async function accountFromRequest(req: Request): Promise<Account | null> {
  const api = rest();
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!api || !token) return null;

  const hit = verified.get(token);
  if (hit && hit.until > Date.now()) return hit.account;

  const user = await api.user<{ id: string; email?: string | null }>(token);
  if (!user?.id) throw new AuthError("Your session expired. Sign in again.");

  const rows = await api.select<ProfileRow[]>(`profiles?select=*&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
  // First sight of this account: give it its default name.
  const username = rows[0]?.username ?? (await api.rpc<string>("rankr_ensure_profile", { p_user: user.id }));
  // Accounts from before keys may still carry a real email: they count as keyless and it is never sent out.
  const account: Account = {
    id: user.id,
    username,
    hasKey: isKeyEmail(user.email),
    official: !!rows[0]?.official,
    about: aboutOf(rows[0]),
  };
  if (verified.size > 5_000) verified.clear();
  verified.set(token, { account, until: Date.now() + 60_000 });
  return account;
}

/**
 * Gives the account a new sign-in key and returns it (the only time it is readable); an older key stops
 * working. Same user, so the name and calls stay. The key's email is set already confirmed: nothing is sent.
 */
export async function makeKey(account: Account): Promise<string> {
  const api = rest();
  if (!api) throw new Error("Accounts are not enabled.");
  const key = generateKey();
  await api.adminUpdateUser(account.id, { email: await keyEmail(key), password: key, email_confirm: true });
  forget(account.id);
  return key;
}

/** Sets or changes the account's public username. */
export async function setUsername(
  account: Account,
  name: string,
): Promise<{ ok: true; username: string } | { ok: false; error: UsernameProblem }> {
  const api = rest();
  if (!api) return { ok: false, error: "invalid" };
  if (account.official) return { ok: false, error: "locked" };
  const problem = checkUsername(name);
  if (problem) return { ok: false, error: problem };
  const out = await api.rpc<{ ok: boolean; username?: string; error?: UsernameProblem }>("rankr_set_username", {
    p_user: account.id,
    p_username: name,
  });
  if (!out.ok) return { ok: false, error: out.error ?? "invalid" };
  forget(account.id);
  return { ok: true, username: out.username ?? name };
}

/**
 * Saves the bio, X account, Telegram username and website (checked with checkProfile). A different X account
 * starts unverified.
 */
export async function setProfile(account: Account, profile: ProfileFields): Promise<CallerAbout | null> {
  const api = rest();
  if (!api) return null;
  const out = await api.rpc<{
    ok: boolean;
    bio?: string | null;
    x?: string | null;
    x_verified?: boolean;
    telegram?: string | null;
    website?: string | null;
  }>("rankr_set_profile", {
    p_user: account.id,
    p_bio: profile.bio,
    p_x: profile.x,
    p_telegram: profile.telegram,
    p_website: profile.website,
  });
  if (!out.ok) return null;
  forget(account.id);
  return {
    bio: out.bio ?? null,
    x: out.x ?? null,
    xVerified: !!out.x_verified,
    telegram: out.telegram ?? null,
    website: out.website ?? null,
  };
}

/**
 * Verifies the account's X account from a link to a public post: it must be from that X account and carry
 * the account's code (xCode). Returns the updated profile, or why not with an HTTP status.
 */
export async function verifyX(
  account: Account,
  link: string,
  read: (id: string) => Promise<Post | null> = readPost,
): Promise<{ ok: true; about: CallerAbout } | { ok: false; error: string; status: number }> {
  const api = rest();
  const x = account.about.x;
  if (!api || !x) return { ok: false, error: "Add your X username first.", status: 400 };
  if (account.about.xVerified) return { ok: true, about: account.about };
  const id = parsePostId(link);
  if (!id) return { ok: false, error: "Paste the link to your post on X (x.com/…/status/…).", status: 400 };
  const post = await read(id);
  if (!post) return { ok: false, error: "Couldn't find that post. Check the link, and that your posts are public.", status: 404 };
  if (post.author.toLowerCase() !== x.toLowerCase()) {
    return { ok: false, error: `That post is from @${post.author}, not @${x}.`, status: 400 };
  }
  const code = xCode(account.id, x);
  if (!post.text.toLowerCase().includes(code)) {
    return { ok: false, error: `That post doesn't have your code (${code}). Post the text above as it is.`, status: 400 };
  }
  const out = await api.rpc<{ ok: boolean }>("rankr_verify_x", { p_user: account.id, p_x: x });
  if (!out.ok) return { ok: false, error: "Your X username changed meanwhile. Reload and try again.", status: 409 };
  forget(account.id);
  return { ok: true, about: { ...account.about, xVerified: true } };
}

/** Why `name` can't be used (by `userId`, whose own current name is fine), or null if it can. */
export async function usernameProblem(name: string, userId?: string): Promise<UsernameProblem | null> {
  const local = checkUsername(name);
  if (local) return local;
  const api = rest();
  if (!api) return null;
  return api.rpc<UsernameProblem | null>("rankr_username_problem", { p_username: name, p_user: userId ?? null });
}

type CallRow = {
  user_id: string;
  token_id: string;
  entry_price_usd: number;
  entry_market_cap: number | null;
  called_at: string;
};

/** Records the caller's own entry at the token's current price. The first call on a token wins. */
export async function recordCall(account: Account, token: TokenView) {
  const api = rest();
  if (!api) return null;
  const price = token.market?.priceUsd || token.entryPriceUsd;
  const out = await api.rpc<{ created: boolean; call: CallRow }>("rankr_record_call", {
    p_user: account.id,
    p_token: token.id,
    p_entry_price: price,
    p_entry_market_cap: token.marketCap,
    p_at: new Date().toISOString(),
  });
  return { created: out.created, entryPriceUsd: out.call.entry_price_usd, calledAt: Date.parse(out.call.called_at) };
}

export async function myCalls(account: Account): Promise<CallView[]> {
  return callsOf(account.id);
}

/** Every call of one user, newest first, each measured from that user's own entry. */
async function callsOf(userId: string): Promise<CallView[]> {
  const api = rest();
  if (!api) return [];
  const rows = await api.rpc<(CallRow & { token: TokenRow })[]>("rankr_my_calls", { p_user: userId });
  const tokens = await viewsOf(rows.map((r) => fromRow(r.token)));
  const byId = new Map(tokens.map((t) => [t.id, t]));
  return rows.flatMap((r) => {
    const token = byId.get(r.token_id);
    if (!token) return [];
    const price = token.market?.priceUsd || token.entryPriceUsd;
    return [
      {
        tokenId: r.token_id,
        entryPriceUsd: r.entry_price_usd,
        entryMarketCap: r.entry_market_cap,
        calledAt: Date.parse(r.called_at),
        multiple: r.entry_price_usd > 0 ? price / r.entry_price_usd : 1,
        token,
      },
    ];
  });
}

type FeedRow = CallRow & {
  kind: "call" | "milestone";
  tier: number | null;
  at: string;
  username: string;
  official?: boolean;
  caller_calls: number;
  caller_hits: number;
  token: TokenRow;
};

export type FeedQuery = {
  limit: number;
  offset: number;
  /** Only these callers (user ids); null for everyone. */
  users: string[] | null;
  chain: string | null;
  kind: "call" | "milestone" | null;
};

/** Newest calls and milestones across callers. Each multiple is measured from that caller's own entry. */
export async function feed(q: FeedQuery): Promise<FeedItem[]> {
  const api = rest();
  if (!api || (q.users && !q.users.length)) return [];
  const rows = await api.rpc<FeedRow[]>("rankr_feed", {
    p_limit: q.limit,
    p_offset: q.offset,
    p_users: q.users,
    p_chain: q.chain,
    p_kind: q.kind,
  });
  const tokens = await viewsOf(rows.map((r) => fromRow(r.token)));
  const byId = new Map(tokens.map((t) => [t.id, t]));
  return rows.flatMap((r) => {
    const t = byId.get(r.token_id);
    if (!t) return [];
    const price = t.market?.priceUsd || t.entryPriceUsd;
    return [
      {
        id: `${r.kind}:${r.user_id}:${r.token_id}:${r.tier ?? ""}`,
        kind: r.kind,
        tier: r.tier,
        at: Date.parse(r.at),
        username: r.username,
        official: !!r.official,
        caller: { calls: r.caller_calls, hits: r.caller_hits },
        token: { id: t.id, chainId: t.chainId, address: t.address, symbol: t.symbol, name: t.name },
        entryMarketCap: r.entry_market_cap,
        multiple: r.entry_price_usd > 0 ? price / r.entry_price_usd : 1,
      },
    ];
  });
}

let topCache: { ids: string[]; until: number } | null = null;

/** User ids of the top callers by hit rate (the default caller board), cached for a minute. */
export async function topCallerIds(n: number): Promise<string[]> {
  if (topCache && topCache.until > Date.now()) return topCache.ids;
  const { callers: top } = await callers("rate", n, 0);
  topCache = { ids: top.map((c) => c.userId), until: Date.now() + 60_000 };
  return topCache.ids;
}

export async function deleteCall(account: Account, tokenId: string): Promise<boolean> {
  const api = rest();
  if (!api) return false;
  return api.rpc<boolean>("rankr_delete_call", { p_user: account.id, p_token: tokenId });
}

type CallerRow = {
  user_id: string;
  username: string;
  official?: boolean;
  calls: number;
  hits: number;
  wins: number;
  avg_multiple: number;
  best_multiple: number;
  best_token: { id: string; address: string; symbol: string; name: string; chain_id: string } | null;
};

export async function callers(sort: CallerSort, limit: number, offset: number): Promise<{ total: number; callers: CallerView[] }> {
  const api = rest();
  if (!api) return { total: 0, callers: [] };
  const out = await api.rpc<{ total: number; callers: CallerRow[] }>("rankr_callers", {
    p_sort: sort,
    p_min_calls: sort === "avg" || sort === "rate" ? MIN_CALLS_RANKED : 1,
    p_limit: limit,
    p_offset: offset,
  });
  return {
    total: out.total,
    callers: out.callers.map((c) => ({
      userId: c.user_id,
      username: c.username,
      official: !!c.official,
      calls: c.calls,
      hits: c.hits,
      wins: c.wins,
      avgMultiple: c.avg_multiple,
      bestMultiple: c.best_multiple,
      bestToken: c.best_token
        ? {
            id: c.best_token.id,
            address: c.best_token.address,
            symbol: c.best_token.symbol,
            name: c.best_token.name,
            chainId: c.best_token.chain_id,
          }
        : null,
    })),
  };
}

/**
 * A caller's public profile by username (any case): their board numbers, bio and links, and their calls.
 * Null when no account has that name. Usernames are letters, numbers and "_" (a LIKE wildcard, so it is
 * escaped). The X account is left out until it is verified.
 */
export async function callerProfile(
  name: string,
): Promise<{ caller: CallerView; about: CallerAbout; calls: CallView[] } | null> {
  const api = rest();
  if (!api || !/^\w{1,32}$/.test(name)) return null;
  const rows = await api.select<ProfileRow[]>(
    `profiles?select=*&username=ilike.${encodeURIComponent(name.replace(/_/g, "\\_"))}&limit=2`,
  );
  const row = rows.find((r) => r.username.toLowerCase() === name.toLowerCase());
  if (!row) return null;
  const calls = await callsOf(row.user_id);
  const about = aboutOf(row);
  return {
    caller: { userId: row.user_id, username: row.username, official: !!row.official, ...callerStats(calls) },
    about: about.xVerified ? about : { ...about, x: null },
    calls,
  };
}

type SeasonRow = {
  month: string;
  ended_at: string;
  counts: { tokens?: number; calls?: number; callers?: number };
  callers: CallerRow[];
  tokens: {
    id: string;
    chain_id: string;
    address: string;
    symbol: string;
    name: string;
    entry_market_cap: number | null;
    peak_multiple: number;
    first_caller: string | null;
  }[];
};

/** The last month that ended (see rankr_end_month), with callers by the names they have now; null before the first. */
export async function lastSeason(): Promise<Season | null> {
  const api = rest();
  if (!api) return null;
  const [row] = await api.select<SeasonRow[]>("seasons?select=*&order=ended_at.desc&limit=1");
  if (!row) return null;
  // A caller may have renamed since the month ended.
  const ids = [...new Set([...row.callers.map((c) => c.user_id), ...row.tokens.flatMap((t) => (t.first_caller ? [t.first_caller] : []))])];
  const now = ids.length
    ? await api.select<{ user_id: string; username: string; official?: boolean }[]>(
        `profiles?select=user_id,username,official&user_id=in.(${ids.map(encodeURIComponent).join(",")})`,
      )
    : [];
  const byId = new Map(now.map((p) => [p.user_id, p]));
  return {
    month: row.month,
    endedAt: Date.parse(row.ended_at),
    counts: { tokens: row.counts.tokens ?? 0, calls: row.counts.calls ?? 0, callers: row.counts.callers ?? 0 },
    callers: row.callers.map((c) => ({
      userId: c.user_id,
      username: byId.get(c.user_id)?.username ?? c.username,
      official: byId.get(c.user_id)?.official ?? !!c.official,
      calls: c.calls,
      hits: c.hits,
      avgMultiple: c.avg_multiple,
      bestMultiple: c.best_multiple,
    })),
    tokens: row.tokens.map((t) => ({
      id: t.id,
      chainId: t.chain_id,
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      entryMarketCap: t.entry_market_cap,
      peakMultiple: t.peak_multiple,
      firstCaller: t.first_caller ? (byId.get(t.first_caller)?.username ?? null) : null,
    })),
  };
}
