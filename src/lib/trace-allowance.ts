// The free allowance: every account may trace a little on the site's keys before it needs keys of its own, for
// a chain it has no key for. Counted per UTC day, per account: wallets read (each card of a trail is one; a wallet
// served from the shared cache costs nothing) and token reports. Accounts that are still guests get less. Server
// only. Together, free reads are also held to a share of the site's budgets (budget.ts, TRACE_FREE_SHARE).
import { peek, spend } from "./rate-limit";
import type { Allowed } from "./trace/keys";
import type { TraceAllowance } from "./types";

const env = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

/** A day's free reads: an account with a sign-in key, and a guest. */
export function allowanceLimits(guest: boolean): Record<Allowed, number> {
  return guest
    ? { wallet: env("TRACE_FREE_GUEST_WALLETS", 10), report: env("TRACE_FREE_GUEST_REPORTS", 2) }
    : { wallet: env("TRACE_FREE_WALLETS", 30), report: env("TRACE_FREE_REPORTS", 5) };
}

function today(now: number) {
  const d = new Date(now);
  return { key: d.toISOString().slice(0, 10), ends: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) };
}

const bucket = (userId: string, what: Allowed, day: string) => `free:${what}:u:${userId}:${day}`;

/** Takes one `what` from the account's allowance today; false when none is left. */
export async function takeAllowance(userId: string, guest: boolean, what: Allowed, now = Date.now()): Promise<boolean> {
  const max = allowanceLimits(guest)[what];
  if (max <= 0) return false;
  const { key, ends } = today(now);
  return (await spend(bucket(userId, what, key), ends - now + 3_600_000, max, 1, now)).ok;
}

/** What's left of the account's allowance today, and when it starts over. */
export async function allowanceOf(userId: string, guest: boolean, now = Date.now()): Promise<TraceAllowance> {
  const limits = allowanceLimits(guest);
  const { key, ends } = today(now);
  const used = await peek([bucket(userId, "wallet", key), bucket(userId, "report", key)]);
  const row = (what: Allowed) => {
    const u = Math.min(limits[what], used.get(bucket(userId, what, key)) ?? 0);
    return { used: u, limit: limits[what] };
  };
  return { wallets: row("wallet"), reports: row("report"), reset: ends, guest };
}
