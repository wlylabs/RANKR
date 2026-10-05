import { NextResponse, type NextRequest } from "next/server";
import { traceCaller } from "@/lib/api-auth";
import { hit, untilReset } from "@/lib/rate-limit";
import { TraceError, traceWallet, walletHoldings } from "@/lib/trace";
import { withKeys } from "@/lib/trace/keys";

export const dynamic = "force-dynamic";
// A busy wallet on the public Solana RPC takes a while: dozens of calls, paced to its rate limit.
export const maxDuration = 60;

const MINUTE = 60_000;
// Only the browser may keep a read: a shared cache would hand it to anyone, past the access check.
const PRIVATE = { "Cache-Control": "private, max-age=60" };
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
 * in and out (labelled where a public list knows them), its trades summed. ?holdings=1 (the wallet a trail
 * starts at) also reads the tokens it holds now, on EVM chains. Reads only public chain data, on the caller's
 * own API keys (the site's for official accounts, traceCaller).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ chain: string; address: string }> }) {
  const caller = await traceCaller(req);
  if (caller instanceof NextResponse) return caller;
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
    const wallet = decode(address).trim();
    // After the trail, so a token's address or a bad one spends nothing on balances.
    const { trace, holdings } = await withKeys(caller.keys, async () => {
      const trace = await traceWallet(chain, wallet);
      const holdings = req.nextUrl.searchParams.get("holdings") === "1" ? await walletHoldings(chain, wallet) : undefined;
      return { trace, holdings };
    });
    return NextResponse.json(holdings === undefined ? trace : { ...trace, holdings }, { headers: PRIVATE });
  } catch (err) {
    if (err instanceof TraceError)
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("[rankr] trace failed", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
