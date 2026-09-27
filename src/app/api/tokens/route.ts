import { NextResponse } from "next/server";
import { listTokens } from "@/lib/rankr";
import type { TokensResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const body: TokensResponse = { tokens: await listTokens(), updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] list failed", err);
    return NextResponse.json({ error: "Could not load tokens." }, { status: 500 });
  }
}
