import { NextResponse } from "next/server";
import { deleteCall, myCalls } from "@/lib/accounts";
import { requireAccount } from "@/lib/api-auth";
import type { MyCallsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  try {
    const body: MyCallsResponse = { calls: await myCalls(account) };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] my calls failed", err);
    return NextResponse.json({ error: "Could not load your calls." }, { status: 500 });
  }
}

/** DELETE /api/me/calls?token=<token id> removes one of your calls. */
export async function DELETE(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });
  try {
    return NextResponse.json({ deleted: await deleteCall(account, token) });
  } catch (err) {
    console.error("[rankr] delete call failed", err);
    return NextResponse.json({ error: "Could not remove the call." }, { status: 500 });
  }
}
