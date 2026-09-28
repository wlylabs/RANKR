import { NextResponse, type NextRequest } from "next/server";
import { isAddress, tokenId } from "@/lib/address";
import { newsFor } from "@/lib/news";
import { queryTokens } from "@/lib/rankr";
import type { NewsResponse, TokenView } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Tokens looked up for the news page when it isn't about one token: the most pasted and the top gainers. */
const EACH = 10;

/**
 * GET /api/news?token=solana:<address> -> headlines that name the token. Without `token`: headlines for the
 * month's most pasted and top tokens on the board.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("token");
  let tokens: TokenView[];
  try {
    if (raw) {
      // "<chain>:<address>"; a Sui address has colons of its own.
      const at = raw.indexOf(":");
      const [chain, address] = [raw.slice(0, at), raw.slice(at + 1)];
      if (at <= 0 || !/^[a-z0-9-]{2,32}$/.test(chain) || !isAddress(address)) {
        return NextResponse.json({ error: "Not a token id." }, { status: 400 });
      }
      const id = tokenId(chain, address);
      tokens = (await queryTokens({ sort: "new", ids: [id], limit: 1, offset: 0 })).tokens;
    } else {
      const [hot, top] = await Promise.all([
        queryTokens({ sort: "hot", hideDead: true, limit: EACH, offset: 0 }),
        queryTokens({ sort: "top", hideDead: true, limit: EACH, offset: 0 }),
      ]);
      tokens = [...new Map([...hot.tokens, ...top.tokens].map((t) => [t.id, t])).values()];
    }
    const body: NewsResponse = {
      items: await newsFor(tokens),
      tokens: tokens.map((t) => ({ id: t.id, chainId: t.chainId, address: t.address, symbol: t.symbol, name: t.name })),
      updatedAt: Date.now(),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] news failed", err);
    return NextResponse.json({ error: "Could not load the news." }, { status: 500 });
  }
}
