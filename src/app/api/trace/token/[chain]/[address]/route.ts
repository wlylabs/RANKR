import { NextResponse, type NextRequest } from "next/server";
import { traceCaller } from "@/lib/api-auth";
import { hit, untilReset } from "@/lib/rate-limit";
import { TraceError, traceToken } from "@/lib/trace";
import { withKeys } from "@/lib/trace/keys";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MINUTE = 60_000;
/** Each report is about ten upstream calls, two of them on GeckoTerminal's 30 a minute. */
const READS_PER_MINUTE = 10;

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * GET /api/trace/token/:chain/:address -> a token's report for the trace page: where its buys and sells come
 * from, who holds it, what its contract allows, and the checks that make its verdict. On the caller's own keys.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ chain: string; address: string }> }) {
  const caller = await traceCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { chain, address } = await params;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const quota = await hit(`trace-token:ip:${ip}`, MINUTE, READS_PER_MINUTE);
  if (!quota.ok) {
    return NextResponse.json(
      { error: `Slow down a bit. Try again in ${untilReset(quota.resetAt)}.`, code: "limit" },
      { status: 429 },
    );
  }

  try {
    const report = await withKeys(caller.keys, () => traceToken(chain, decode(address).trim()));
    return NextResponse.json(report, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (err) {
    if (err instanceof TraceError)
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("[rankr] token trace failed", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
