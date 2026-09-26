import { NextResponse } from "next/server";
import { listLeaderboard } from "@/lib/entrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const leaderboard = listLeaderboard();
  return NextResponse.json({ leaderboard });
}
