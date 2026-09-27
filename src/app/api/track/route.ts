import { NextResponse } from "next/server";
import { AuthError, accountFromRequest, accountsEnabled, recordCall, type Account } from "@/lib/accounts";
import { RankrError, trackToken } from "@/lib/rankr";

export const dynamic = "force-dynamic";

// Light per-IP limit so one client can't flood the upstream API.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return NextResponse.json({ error: "Slow down a bit, too many pastes." }, { status: 429 });
  }

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

  // With accounts set up, every paste is somebody's call: sign in (as a guest or by email) first.
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
