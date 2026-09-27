import { NextResponse } from "next/server";
import { AuthError, accountFromRequest, accountsEnabled, type Account } from "./accounts";

/** Resolves the signed-in wallet or returns the error response to send instead. */
export async function requireAccount(req: Request): Promise<Account | NextResponse> {
  if (!accountsEnabled()) return NextResponse.json({ error: "Wallet accounts are not enabled." }, { status: 404 });
  try {
    const account = await accountFromRequest(req);
    return account ?? NextResponse.json({ error: "Connect your wallet first." }, { status: 401 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("[rankr] auth failed", err);
    return NextResponse.json({ error: "Could not verify your session." }, { status: 502 });
  }
}
