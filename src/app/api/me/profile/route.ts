import { NextResponse } from "next/server";
import { setProfile } from "@/lib/accounts";
import { requireAccount } from "@/lib/api-auth";
import { checkProfile } from "@/lib/profile";
import type { MeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/me/profile {bio, x, telegram} saves your bio and links ("" clears one). */
export async function POST(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 1_000) : "");
  const checked = checkProfile({ bio: text(body.bio), x: text(body.x), telegram: text(body.telegram) });
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400 });
  try {
    const about = await setProfile(account, checked.profile);
    if (!about) return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
    const out: MeResponse = { account: { ...account, about } };
    return NextResponse.json(out);
  } catch (err) {
    console.error("[rankr] save profile failed", err);
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }
}
