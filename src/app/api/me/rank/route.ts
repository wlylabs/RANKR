import { NextResponse, type NextRequest } from "next/server";
import { callerRank } from "@/lib/accounts";
import { requireAccount } from "@/lib/api-auth";
import { parseCallerSort } from "@/lib/params";
import type { MyRankResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/me/rank?sort=rate|avg|hits|best|calls: your place on the caller board. */
export async function GET(req: NextRequest) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  try {
    const body: MyRankResponse = await callerRank(account.id, parseCallerSort(req.nextUrl.searchParams.get("sort")));
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] rank failed", err);
    return NextResponse.json({ error: "Could not load your rank." }, { status: 500 });
  }
}
