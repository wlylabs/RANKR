import { NextResponse } from "next/server";
import { liveNews } from "@/lib/news";
import type { NewsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/news -> what's in the news right now, most searched first. */
export async function GET() {
  try {
    const body: NewsResponse = { items: await liveNews(), updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] news failed", err);
    return NextResponse.json({ error: "Could not load the news." }, { status: 500 });
  }
}
