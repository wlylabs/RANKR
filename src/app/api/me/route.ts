import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/api-auth";
import type { MeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The signed-in account: id, email (only ever sent to its owner) and username. */
export async function GET(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  const body: MeResponse = { account };
  return NextResponse.json(body);
}
