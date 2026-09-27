import { NextResponse } from "next/server";
import { RankrError, trackToken } from "@/lib/rankr";

export const dynamic = "force-dynamic";

// Light per-IP limit so one client can't flood the upstream API.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return NextResponse.json({ error: "Slow down a bit, too many pastes." }, { status: 429 });
  }

  let body: { input?: unknown; chain?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const { input, chain } = body;
  if (typeof input !== "string" || !input.trim() || input.length > 300) {
    return NextResponse.json({ error: "Paste a token contract address." }, { status: 400 });
  }

  try {
    const chainId = typeof chain === "string" && /^[a-z0-9-]{2,32}$/.test(chain) ? chain : undefined;
    const result = await trackToken(input, chainId);
    return NextResponse.json(result, { status: result.status === "created" ? 201 : 200 });
  } catch (err) {
    if (err instanceof RankrError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[rankr] track failed", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
