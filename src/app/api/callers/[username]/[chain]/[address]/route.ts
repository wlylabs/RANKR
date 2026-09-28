import { NextResponse } from "next/server";
import { accountsEnabled, callerCall } from "@/lib/accounts";
import type { CallResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string; chain: string; address: string }> };

/** GET /api/callers/:username/:chain/:address -> that caller's call on the token, from their own entry */
export async function GET(_req: Request, { params }: Params) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Calls need accounts." }, { status: 404 });
  const { username, chain, address } = await params;
  try {
    const found = await callerCall(decodeURIComponent(username), chain, decodeURIComponent(address));
    if (!found) return NextResponse.json({ error: "No such call." }, { status: 404 });
    const body: CallResponse = { ...found, updatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] call failed", err);
    return NextResponse.json({ error: "Could not load this call." }, { status: 500 });
  }
}
