import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/api-auth";
import type { MeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The signed-in account: id, username and whether it has a sign-in key. */
export async function GET(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  const body: MeResponse = { account };
  return NextResponse.json(body);
}
