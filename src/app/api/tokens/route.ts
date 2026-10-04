import { NextResponse, type NextRequest } from "next/server";
import { MAX_LIMIT } from "@/lib/params";
import { queryTokens } from "@/lib/rankr";
import type { TokensResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/tokens?ids=a,b: live data for the tokens Rankr tracks among these ids (from tokenId), newest first. */
export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean).slice(0, MAX_LIMIT) ?? [];
  if (!ids.length) {
    const body: TokensResponse = { tokens: [], total: 0, updatedAt: Date.now() };
    return NextResponse.json(body);
  }
  try {
    const { total, tokens } = await queryTokens({ ids, limit: ids.length, offset: 0 });
    const body: TokensResponse = { tokens, total, updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] query failed", err);
    return NextResponse.json({ error: "Could not load tokens." }, { status: 500 });
  }
}
