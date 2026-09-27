import type { Metadata } from "next";
import { cache } from "react";
import { TokenDetail } from "@/components/TokenDetail";
import { formatMove, formatMultiple, formatUsd } from "@/lib/format";
import { getToken } from "@/lib/rankr";
import type { TokenResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ chain: string; address: string }> };

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// generateMetadata and the page share one lookup per request.
const load = cache(async (chain: string, address: string): Promise<TokenResponse> => {
  try {
    return await getToken(chain, address);
  } catch {
    return { token: null, preview: null };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chain, address } = await params;
  const { token, preview } = await load(chain, decode(address));
  if (token) {
    return {
      title: `$${token.symbol} ${formatMultiple(token.multiple)}`,
      description: `$${token.symbol} is ${formatMove(token.multiple)} since it was first pasted on Rankr at ${formatUsd(token.entryMarketCap)} market cap.`,
    };
  }
  if (preview) return { title: `$${preview.symbol}`, description: `Track $${preview.symbol} on Rankr.` };
  return { title: "Token not found" };
}

export default async function TokenPage({ params }: Props) {
  const { chain, address } = await params;
  const addr = decode(address);
  return <TokenDetail chain={chain} address={addr} initial={await load(chain, addr)} />;
}
