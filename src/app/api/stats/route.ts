import { NextResponse } from "next/server";
import { getStats } from "@/lib/rankr";
import type { StatsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const body: StatsResponse = { ...(await getStats()), updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] stats failed", err);
    return NextResponse.json({ error: "Could not load stats." }, { status: 500 });
  }
}
