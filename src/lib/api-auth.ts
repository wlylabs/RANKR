import { NextResponse } from "next/server";
import { AuthError, accountFromRequest, accountsEnabled, type Account } from "./accounts";

/** Resolves the caller or returns the error response to send instead. */
export async function requireAccount(req: Request): Promise<Account | NextResponse> {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled." }, { status: 404 });
  try {
    const account = await accountFromRequest(req);
    return account ?? NextResponse.json({ error: "Sign in first.", code: "signin" }, { status: 401 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message, code: "signin" }, { status: 401 });
    console.error("[rankr] auth failed", err);
    return NextResponse.json({ error: "Could not verify your session." }, { status: 502 });
  }
}

/**
 * Trace is private: official accounts only (the project's own, given by its owner with rankr_set_official).
 * Without accounts (local dev) it's open, like pasting. Null when the caller may read; else the response to send.
 */
export async function requireTraceAccess(req: Request): Promise<NextResponse | null> {
  if (!accountsEnabled()) return null;
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  if (account.official) return null;
  return NextResponse.json({ error: "Trace is private for now.", code: "private" }, { status: 403 });
}
