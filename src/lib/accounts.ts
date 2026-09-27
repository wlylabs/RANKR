// Anonymous accounts (Supabase Auth anonymous sign-ins) and per-user calls. Server only.
import { MIN_CALLS_FOR_AVG, type CallerSort } from "./params";
import { viewsOf } from "./rankr";
import { fromRow, type TokenRow } from "./store/supabase";
import { SupabaseRest, supabaseConfig } from "./supabase-rest";
import type { CallView, CallerView, TokenView } from "./types";

/** A caller. Anonymous: nothing but an id and the public handle derived from it. */
export type Account = { id: string; handle: string };

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
const profiled = new Map<string, string>(); // user id -> handle, once the profile exists

/**
 * The caller behind `Authorization: Bearer <supabase access token>`, or null when the request has
 * no token. Throws AuthError when a token is sent but isn't valid.
 */
export async function accountFromRequest(req: Request): Promise<Account | null> {
  const api = rest();
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!api || !token) return null;

  const hit = verified.get(token);
  if (hit && hit.until > Date.now()) return hit.account;

  const user = await api.user<{ id: string }>(token);
  if (!user?.id) throw new AuthError("Your session expired. Paste again to continue.");

  let handle = profiled.get(user.id);
  if (!handle) {
    handle = await api.rpc<string>("rankr_upsert_profile", { p_user: user.id });
    profiled.set(user.id, handle);
  }
  const account = { id: user.id, handle };
  if (verified.size > 5_000) verified.clear();
  verified.set(token, { account, until: Date.now() + 60_000 });
  return account;
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
  handle: string;
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
      handle: c.handle,
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
