import { NextResponse, type NextRequest } from "next/server";
import { accountsEnabled, feed, topCallerIds } from "@/lib/accounts";
import { requireAccount } from "@/lib/api-auth";
import { pasteEvents } from "@/lib/feed";
import { FEED_TOP_CALLERS, parseFeedKind, parseFeedScope } from "@/lib/params";
import { queryTokens } from "@/lib/rankr";
import type { FeedItem, FeedResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

function int(value: string | null, fallback: number, min: number, max: number) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/**
 * GET /api/feed?scope=all|top|you&kind=all|call|milestone&chain=solana&limit=20&offset=0
 * Newest calls ("@userx called $SHIB at $1.2B mc") and milestones ("$PEPE hit 10x from @userx's call").
 * scope=you: the signed-in caller's own (`Authorization: Bearer <access token>`).
 * Without accounts (local dev) pastes stand in for calls, with no caller.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const scope = parseFeedScope(p.get("scope"));
  const kindParam = parseFeedKind(p.get("kind"));
  const kind = kindParam === "all" ? null : kindParam;
  const chainParam = p.get("chain");
  const chain = chainParam && /^[a-z0-9-]{2,32}$/.test(chainParam) ? chainParam : null;
  const limit = int(p.get("limit"), 20, 1, 50);
  const offset = int(p.get("offset"), 0, 0, 500);

  try {
    let items: FeedItem[];
    if (accountsEnabled()) {
      let users: string[] | null = null;
      if (scope === "top") users = await topCallerIds(FEED_TOP_CALLERS);
      else if (scope === "you") {
        const account = await requireAccount(req);
        if (account instanceof NextResponse) return account;
        users = [account.id];
      }
      items = await feed({ limit, offset, users, chain, kind });
    } else if (scope !== "all") {
      items = []; // no callers without accounts
    } else {
      const { tokens } = await queryTokens({ sort: "new", chain, limit: Math.min(offset + limit, 100), offset: 0 });
      items = pasteEvents(tokens, kind).slice(offset, offset + limit);
    }
    const body: FeedResponse = { items, updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] feed failed", err);
    return NextResponse.json({ error: "Could not load the feed." }, { status: 500 });
  }
}
