import { NextResponse, type NextRequest } from "next/server";
import { accountsEnabled, callers } from "@/lib/accounts";
import { MAX_LIMIT, parseCallerSort } from "@/lib/params";
import type { CallersResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/callers?sort=hits|avg|best|calls&limit=50&offset=0 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (!accountsEnabled()) {
    const body: CallersResponse = { enabled: false, total: 0, callers: [], updatedAt: Date.now() };
    return NextResponse.json(body);
  }
  const limit = Math.min(Math.max(Number.parseInt(p.get("limit") ?? "50", 10) || 50, 1), MAX_LIMIT);
  const offset = Math.max(Number.parseInt(p.get("offset") ?? "0", 10) || 0, 0);
  try {
    const body: CallersResponse = { enabled: true, ...(await callers(parseCallerSort(p.get("sort")), limit, offset)), updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] callers failed", err);
    return NextResponse.json({ error: "Could not load callers." }, { status: 500 });
  }
}
