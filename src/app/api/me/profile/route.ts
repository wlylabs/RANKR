import { NextResponse } from "next/server";
import { myProfile, setProfile } from "@/lib/accounts";
import { requireAccount } from "@/lib/api-auth";
import { profileMessage } from "@/lib/profile";
import type { ProfileResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/me/profile -> your bio and links */
export async function GET(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  try {
    const body: ProfileResponse = { profile: await myProfile(account) };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] read profile failed", err);
    return NextResponse.json({ error: "Could not load your profile." }, { status: 500 });
  }
}

/** POST /api/me/profile {bio, links: [{label, url}]} sets your bio and links, shown on your public page. */
export async function POST(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: profileMessage("invalid"), code: "invalid" }, { status: 400 });
  }
  try {
    const out = await setProfile(account, input);
    if (!out.ok) {
      if (out.error === "not_found") return NextResponse.json({ error: "Could not find your profile." }, { status: 404 });
      return NextResponse.json({ error: profileMessage(out.error), code: out.error, index: out.index }, { status: 400 });
    }
    const body: ProfileResponse = { profile: out.profile };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] set profile failed", err);
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }
}
