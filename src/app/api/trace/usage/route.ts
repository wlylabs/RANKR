import { NextResponse, type NextRequest } from "next/server";
import { traceCaller } from "@/lib/api-auth";
import { usage } from "@/lib/budget";
import { withKeys } from "@/lib/trace/keys";

export const dynamic = "force-dynamic";

/**
 * GET /api/trace/usage -> every free API's usage budget, in the shape of GitHub's /rate_limit: for each, its
 * window, limit, used, remaining and reset (ms), and whether it's counted for every server or this one. Reads
 * the counters, takes nothing. The caller's own budgets (on its own keys), or the site's for official accounts.
 */
export async function GET(req: NextRequest) {
  const caller = await traceCaller(req);
  if (caller instanceof NextResponse) return caller;
  const now = Date.now();
  return NextResponse.json({ resources: await withKeys(caller.keys, () => usage(now)), at: now }, { headers: { "Cache-Control": "no-store" } });
}
