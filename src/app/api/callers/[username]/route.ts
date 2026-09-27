import { NextResponse } from "next/server";
import { accountsEnabled, callerProfile } from "@/lib/accounts";
import type { CallerProfileResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/callers/:username -> the caller's board numbers and calls */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Caller profiles need accounts." }, { status: 404 });
  const { username } = await params;
  try {
    const profile = await callerProfile(decodeURIComponent(username));
    if (!profile) return NextResponse.json({ error: "No caller with that name." }, { status: 404 });
    const body: CallerProfileResponse = { ...profile, updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] caller profile failed", err);
    return NextResponse.json({ error: "Could not load this caller." }, { status: 500 });
  }
}
