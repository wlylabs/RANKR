import { NextResponse, type NextRequest } from "next/server";
import { MAX_LIMIT, parseRange, parseSort, RANGES } from "@/lib/params";
import { queryTokens } from "@/lib/rankr";
import type { TokensResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

function int(value: string | null, fallback: number, max: number) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
}

/**
 * GET /api/tokens?sort=top|peak|losers|new|hot&range=24h|7d|30d|all&chain=solana&q=pepe&ids=a,b&limit=50&offset=0
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const rangeMs = RANGES[parseRange(p.get("range"))];
  const chain = p.get("chain");
  const ids = p.get("ids")?.split(",").filter(Boolean).slice(0, MAX_LIMIT) ?? null;

  try {
    const { total, tokens } = await queryTokens({
      sort: parseSort(p.get("sort")),
      chain: chain && /^[a-z0-9-]{2,32}$/.test(chain) ? chain : null,
      since: rangeMs ? Date.now() - rangeMs : null,
      q: p.get("q")?.trim().replace(/^\$/, "").slice(0, 100) || null,
      ids,
      limit: int(p.get("limit"), 50, MAX_LIMIT) || 1,
      offset: int(p.get("offset"), 0, 100_000),
    });
    const body: TokensResponse = { tokens, total, updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] query failed", err);
    return NextResponse.json({ error: "Could not load tokens." }, { status: 500 });
  }
}
