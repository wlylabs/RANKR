import { NextResponse } from "next/server";
import { myRecaps } from "@/lib/accounts";
import { requireAccount } from "@/lib/api-auth";
import type { MyRecapsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/me/recaps: the signed-in caller's own monthly recaps, newest first. Private: nobody else's. */
export async function GET(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  try {
    const body: MyRecapsResponse = { recaps: await myRecaps(account) };
    return NextResponse.json(body, { headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    console.error("[rankr] recaps failed", err);
    return NextResponse.json({ error: "Could not load your recaps." }, { status: 500 });
  }
}
