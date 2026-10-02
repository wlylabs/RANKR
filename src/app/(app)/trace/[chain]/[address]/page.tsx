import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TraceView } from "@/components/trace/TraceView";
import { shortAddress } from "@/lib/format";
import { traceChain, validWallet } from "@/lib/trace/chains";

type Props = { params: Promise<{ chain: string; address: string }> };

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chain, address: raw } = await params;
  const address = decode(raw).trim();
  const meta = traceChain(chain);
  // The page shows not-found.tsx for these, under the same title.
  if (!meta || !validWallet(meta, address)) return { title: "No trail here" };
  const short = shortAddress(address);
  return {
    title: `Trace ${short}`,
    description: `Where ${short}'s money came from and where it went, hop by hop, on Rankr.`,
  };
}

export default async function TraceWalletPage({ params }: Props) {
  const { chain, address: raw } = await params;
  const address = decode(raw).trim();
  const meta = traceChain(chain);
  if (!meta || !validWallet(meta, address)) notFound();
  // A new wallet starts a new trail.
  return <TraceView key={`${chain}:${address}`} chain={chain} address={address} />;
}
