import { NextResponse } from "next/server";
import { myCalls } from "@/lib/accounts";
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

