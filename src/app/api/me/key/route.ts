import { NextResponse } from "next/server";
import { makeKey } from "@/lib/accounts";
import { requireAccount } from "@/lib/api-auth";
import type { KeyResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/me/key gives your account a new sign-in key (any older one stops working) and returns it once. */
export async function POST(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  try {
    const key = await makeKey(account);
    const body: KeyResponse = { key, account: { ...account, hasKey: true } };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[rankr] making a key failed", err);
    return NextResponse.json({ error: "Could not make your key. Try again." }, { status: 502 });
  }
}
