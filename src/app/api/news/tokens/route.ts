import { NextResponse, type NextRequest } from "next/server";
import { tokenId } from "@/lib/address";
import { UpstreamError } from "@/lib/dexscreener";
import { namesakes } from "@/lib/news";
import { queryTokens } from "@/lib/rankr";
import { hit, untilReset } from "@/lib/rate-limit";
import type { NamesakesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const MINUTE = 60_000;
const SEARCHES_PER_MINUTE = 30;

/**
 * GET /api/news/tokens?q=Bukang-i -> every live token named after a name from a story, most traded first, with
 * market cap, volume, liquidity and Rankr's multiple for tracked ones.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 64) return NextResponse.json({ error: "Name a token." }, { status: 400 });

  // Every search asks DexScreener, shared by everyone.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const quota = await hit(`news-tokens:ip:${ip}`, MINUTE, SEARCHES_PER_MINUTE);
  if (!quota.ok) {
    return NextResponse.json({ error: `Slow down a bit. Try again in ${untilReset(quota.resetAt)}.`, code: "limit" }, { status: 429 });
  }

  try {
    const markets = await namesakes(q);
    const ids = markets.map((m) => tokenId(m.chainId, m.address));
    const tracked = ids.length ? (await queryTokens({ sort: "new", ids, limit: ids.length, offset: 0 })).tokens : [];
    const multiples = new Map(tracked.map((t) => [t.id, t.multiple]));
    const body: NamesakesResponse = {
      items: markets.map((market, i) => ({ market, multiple: multiples.get(ids[i]) ?? null })),
      updatedAt: Date.now(),
    };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof UpstreamError) {
      return NextResponse.json({ error: "DexScreener isn't answering. Try again in a moment." }, { status: 502 });
    }
    console.error("[rankr] news tokens failed", err);
    return NextResponse.json({ error: "Could not load the tokens." }, { status: 500 });
  }
}
