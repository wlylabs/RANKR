import { NextResponse } from "next/server";
import { lastSeason } from "@/lib/accounts";
import type { SeasonResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/season -> the last month that ended: its top 10 callers and tokens (null before the first reset). */
export async function GET() {
  let last = null;
  try {
    last = await lastSeason();
  } catch (err) {
    // E.g. before …_rankr_monthly_reset.sql has run: nothing to show yet.
    console.error("[rankr] last season failed", err);
  }
  const body: SeasonResponse = { last };
  return NextResponse.json(body);
}
