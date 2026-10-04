import { NextResponse } from "next/server";
import { AuthError, accountFromRequest, accountsEnabled, recordCall, type Account } from "@/lib/accounts";
import { parseInput } from "@/lib/address";
import { PASTE_LIMITS } from "@/lib/params";
import { RankrError, trackToken } from "@/lib/rankr";
import { hit, untilReset, type Quota } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MINUTE = 60_000;
const DAY = 86_400_000;

function tooMany(error: string, quota: Quota) {
  const retryAfter = Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000));
  return NextResponse.json({ error, code: "limit" }, { status: 429, headers: { "retry-after": String(retryAfter) } });
}

export async function POST(req: Request) {
  // Bursts from one address, before anything else (it also shields DexScreener, shared by everyone).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const burst = await hit(`paste:ip:${ip}`, MINUTE, PASTE_LIMITS.ipPerMinute);
  if (!burst.ok) return tooMany(`Slow down a bit, too many pastes. Try again in ${untilReset(burst.resetAt)}.`, burst);

  let body: { input?: unknown; chain?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const { input, chain } = body;
  if (typeof input !== "string" || !input.trim() || input.length > 300) {
    return NextResponse.json({ error: "Paste a token contract address." }, { status: 400 });
  }

  // With accounts set up, every paste is somebody's call: sign in (as a guest or with a key) first.
  let account: Account | null = null;
  if (accountsEnabled()) {
    try {
      account = await accountFromRequest(req);
    } catch (err) {
      if (!(err instanceof AuthError)) {
        console.error("[rankr] auth failed", err);
        return NextResponse.json({ error: "Could not verify your session. Try again." }, { status: 502 });
      }
    }
    if (!account) return NextResponse.json({ error: "Sign in to paste.", code: "signin" }, { status: 401 });
    if (!account.username) {
      return NextResponse.json({ error: "Pick a username to paste.", code: "username" }, { status: 403 });
    }
  }

  // Not a CA or token link: say so without spending the daily quota on it.
  if (!parseInput(input.trim())) {
    return NextResponse.json({ error: "That doesn't look like a token address or token link." }, { status: 400 });
  }

  // A daily quota per account, so one account can't spray the feed: fewer for guests, none for official accounts.
  if (account && !account.official) {
    const max = account.hasKey ? PASTE_LIMITS.keyedPerDay : PASTE_LIMITS.guestPerDay;
    const quota = await hit(`paste:user:${account.id}:day`, DAY, max);
    if (!quota.ok) {
      const wait = untilReset(quota.resetAt);
      return tooMany(
        account.hasKey
          ? `That's ${max} pastes today, the daily limit. Try again in ${wait}.`
          : `Guests can paste ${max} times a day. Save your key to get ${PASTE_LIMITS.keyedPerDay}, or try again in ${wait}.`,
        quota,
      );
    }
  }

  try {
    const chainId = typeof chain === "string" && /^[a-z0-9-]{2,32}$/.test(chain) ? chain : undefined;
    const result = await trackToken(input, chainId);
    if (account) {
      result.call = await recordCall(account, result.token).catch((err) => {
        console.error("[rankr] recording call failed", err);
        return null;
      });
    }
    return NextResponse.json(result, { status: result.status === "created" ? 201 : 200 });
  } catch (err) {
    if (err instanceof RankrError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[rankr] track failed", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
