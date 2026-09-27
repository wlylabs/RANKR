import { NextResponse, type NextRequest } from "next/server";
import { isAddress, tokenId } from "@/lib/address";
import { MAX_LIMIT } from "@/lib/params";
import { watchlistOf } from "@/lib/rankr";
import type { WatchlistResponse } from "@/lib/types";

export const dynamic = "force-dynamic";


/**
 * GET /api/watchlist?ids=solana:<address>,base:<address> -> live data for watched tokens, whether Rankr tracks
 * them or not. The watchlist itself stays in the browser.
 */
export async function GET(req: NextRequest) {
  const ids = [
    ...new Set(
      (req.nextUrl.searchParams.get("ids") ?? "").split(",").flatMap((raw) => {
        // "<chain>:<address>"; a Sui address has colons of its own.
        const at = raw.indexOf(":");
        const [chain, address] = [raw.slice(0, at), raw.slice(at + 1)];
        return at > 0 && /^[a-z0-9-]{2,32}$/.test(chain) && isAddress(address) ? [tokenId(chain, address)] : [];
      }),
    ),
  ].slice(0, MAX_LIMIT);
  try {
    const body: WatchlistResponse = { items: await watchlistOf(ids), updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] watchlist failed", err);
    return NextResponse.json({ error: "Could not load your watchlist." }, { status: 500 });
  }
}
