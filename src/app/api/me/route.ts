import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** The caller's id and handle. Also creates the profile on first sight. */
export async function GET(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  return NextResponse.json({ account });
}
