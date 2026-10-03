import { NextResponse, type NextRequest } from "next/server";
import { requireTraceAccess } from "@/lib/api-auth";
import { usage } from "@/lib/budget";

export const dynamic = "force-dynamic";

/**
 * GET /api/trace/usage -> every free API's usage budget, in the shape of GitHub's /rate_limit: for each, its
 * window, limit, used, remaining and reset (ms), and whether it's counted for every server or this one. Reads
 * the counters, takes nothing. Official accounts only, like the rest of Trace.
 */
export async function GET(req: NextRequest) {
  const denied = await requireTraceAccess(req);
  if (denied) return denied;
  const now = Date.now();
  return NextResponse.json({ resources: await usage(now), at: now }, { headers: { "Cache-Control": "no-store" } });
}
