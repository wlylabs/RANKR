import { NextResponse, type NextRequest } from "next/server";
import { hit, untilReset } from "@/lib/rate-limit";
import { TraceError, traceWallet } from "@/lib/trace";

export const dynamic = "force-dynamic";
// A busy wallet on the public Solana RPC takes a while: dozens of calls, paced to its rate limit.
export const maxDuration = 60;

const MINUTE = 60_000;
/** Each read is dozens of upstream calls on free, shared quotas. */
const READS_PER_MINUTE = 20;

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * GET /api/trace/:chain/:address -> one wallet for the trace page: who funded it, its biggest counterparties
 * in and out (labelled where a public list knows them), its trades summed. Reads only public chain data.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const quota = await hit(`trace:ip:${ip}`, MINUTE, READS_PER_MINUTE);
  if (!quota.ok) {
    return NextResponse.json(
      { error: `Slow down a bit. Try again in ${untilReset(quota.resetAt)}.`, code: "limit" },
      { status: 429 },
    );
  }

  try {
    const trace = await traceWallet(chain, decode(address).trim());
    // Public data, the same for everyone: shared caches may keep it a minute.
    return NextResponse.json(trace, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  } catch (err) {
    if (err instanceof TraceError)
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("[rankr] trace failed", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
