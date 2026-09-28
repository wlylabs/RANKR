import { NextResponse, type NextRequest } from "next/server";
import { liveNews, searchNews } from "@/lib/news";
import type { NewsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/news -> what's in the news right now, newest first. ?q=shark -> headlines for a search. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length > 100) return NextResponse.json({ error: "Search for something shorter." }, { status: 400 });
  try {
    const body: NewsResponse = { items: q ? await searchNews(q) : await liveNews(), updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] news failed", err);
    return NextResponse.json({ error: "Could not load the news." }, { status: 500 });
  }
}
