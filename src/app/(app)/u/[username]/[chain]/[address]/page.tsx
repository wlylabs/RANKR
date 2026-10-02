import type { Metadata } from "next";
import { cache } from "react";
import { CallDetail } from "@/components/CallDetail";
import { callerCall } from "@/lib/accounts";
import { formatMultiple, formatUsd } from "@/lib/format";
import { OG_HD_SIZE } from "@/lib/og";
import type { CallResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string; chain: string; address: string }> };

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// generateMetadata and the page share one lookup per request.
const load = cache(async (username: string, chain: string, address: string): Promise<CallResponse | null> => {
  const found = await callerCall(username, chain, address).catch(() => null);
  return found && { ...found, updatedAt: Date.now() };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, chain, address } = await params;
  const found = await load(decode(username), chain, decode(address));
  if (!found) return { title: "Call not found", robots: { index: false } };
  const { caller, call } = found;
  const title = `@${caller.username} called $${call.token.symbol}: ${formatMultiple(call.multiple)}`;
  const description = `@${caller.username} called $${call.token.symbol} at ${formatUsd(call.entryMarketCap)} market cap on Rankr: ${formatMultiple(call.multiple)} since, from their own entry.`;
  // The share card is the link preview (X, Telegram, Discord...).
  const image = {
    url: `/api/callers/${encodeURIComponent(caller.username)}/${chain}/${encodeURIComponent(decode(address))}/card`,
    ...OG_HD_SIZE,
    alt: title,
  };
  return {
    title,
    description,
    openGraph: { siteName: "Rankr", type: "website", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function CallPage({ params }: Props) {
  const { username, chain, address } = await params;
  const name = decode(username);
  const addr = decode(address);
  return <CallDetail username={name} chain={chain} address={addr} initial={await load(name, chain, addr)} />;
}
