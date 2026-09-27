import { NextResponse, type NextRequest } from "next/server";
import { accountsEnabled, recentCalls } from "@/lib/accounts";
import { queryTokens } from "@/lib/rankr";
import type { FeedItem, FeedResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed?limit=20 -> the newest calls ("@userx called $SHIB at $1.2B mc"). Without accounts
 * (local dev) the newest pastes stand in, with no caller.
 */
export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 1), 50);
  try {
    let items: FeedItem[];
    if (accountsEnabled()) {
      items = await recentCalls(limit);
    } else {
      const { tokens } = await queryTokens({ sort: "new", limit, offset: 0 });
      items = tokens.map((t) => ({
        id: t.id,
        username: null,
        official: false,
        token: { id: t.id, chainId: t.chainId, address: t.address, symbol: t.symbol, name: t.name },
        entryMarketCap: t.entryMarketCap,
        calledAt: t.firstPastedAt,
        multiple: t.multiple,
      }));
    }
    const body: FeedResponse = { items, updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] feed failed", err);
    return NextResponse.json({ error: "Could not load the feed." }, { status: 500 });
  }
}
