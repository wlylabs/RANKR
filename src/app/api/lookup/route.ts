import { NextResponse, type NextRequest } from "next/server";
import { RankrError, lookupToken } from "@/lib/rankr";
import { hit, untilReset } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MINUTE = 60_000;
const LOOKUPS_PER_MINUTE = 30;

/**
 * GET /api/lookup?input=<CA or link> -> the token a paste points at (live data, and Rankr's record if it has
 * one), before choosing to call it or watch it. Writes nothing and needs no account.
 */
export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get("input")?.trim() ?? "";
  if (!input || input.length > 300) return NextResponse.json({ error: "Paste a token contract address." }, { status: 400 });

  // Every lookup asks DexScreener, shared by everyone.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const quota = await hit(`lookup:ip:${ip}`, MINUTE, LOOKUPS_PER_MINUTE);
  if (!quota.ok) {
    return NextResponse.json({ error: `Slow down a bit. Try again in ${untilReset(quota.resetAt)}.`, code: "limit" }, { status: 429 });
  }

  try {
    return NextResponse.json(await lookupToken(input));
  } catch (err) {
    if (err instanceof RankrError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[rankr] lookup failed", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
