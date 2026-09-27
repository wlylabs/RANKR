import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** The signed-in wallet. Also creates its profile on first sight. */
export async function GET(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  return NextResponse.json({ account });
}
