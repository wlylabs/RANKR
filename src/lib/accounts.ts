// Accounts (Supabase Auth: one-click guests or email magic link) with a public username, and per-user
// calls. Server only.
import { MIN_CALLS_FOR_AVG, type CallerSort } from "./params";
import { viewsOf } from "./rankr";
import { fromRow, type TokenRow } from "./store/supabase";
import { SupabaseRest, supabaseConfig } from "./supabase-rest";
import type { CallView, CallerView, TokenView } from "./types";
import { checkUsername, type UsernameProblem } from "./username";

/**
 * A signed-in user. New accounts get a default name (e.g. nonce_7f3a) they can change. `guest` accounts
 * (anonymous sign-in) have no email and live in one browser until an email is added. The email is never
 * shown publicly.
 */
export type Account = { id: string; email: string | null; username: string | null; guest: boolean };

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

  const user = await api.user<{ id: string; email?: string | null; is_anonymous?: boolean }>(token);
  if (!user?.id) throw new AuthError("Your session expired. Sign in again.");

  const rows = await api.select<{ username: string }[]>(
    `profiles?select=username&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
  );
  // First sight of this account: give it its default name.
  const username = rows[0]?.username ?? (await api.rpc<string>("rankr_ensure_profile", { p_user: user.id }));
  const account: Account = { id: user.id, email: user.email || null, username, guest: !!user.is_anonymous };
  if (verified.size > 5_000) verified.clear();
  verified.set(token, { account, until: Date.now() + 60_000 });
  return account;
}

/** Sets or changes the account's public username. */
export async function setUsername(
  account: Account,
  name: string,
): Promise<{ ok: true; username: string } | { ok: false; error: UsernameProblem }> {
  const api = rest();
  if (!api) return { ok: false, error: "invalid" };
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
  const api = rest();
  if (!api) return [];
  const rows = await api.rpc<(CallRow & { token: TokenRow })[]>("rankr_my_calls", { p_user: account.id });
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

export async function deleteCall(account: Account, tokenId: string): Promise<boolean> {
  const api = rest();
  if (!api) return false;
  return api.rpc<boolean>("rankr_delete_call", { p_user: account.id, p_token: tokenId });
}

type CallerRow = {
  user_id: string;
  username: string;
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
    p_min_calls: sort === "avg" ? MIN_CALLS_FOR_AVG : 1,
    p_limit: limit,
    p_offset: offset,
  });
  return {
    total: out.total,
    callers: out.callers.map((c) => ({
      userId: c.user_id,
      username: c.username,
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
