import { NextResponse } from "next/server";
import { AuthError, accountFromRequest, accountsEnabled, type Account } from "./accounts";
import type { OwnKeys } from "./trace/keys";
import { loadKeys } from "./trace-keys";

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
 * Trace is open to every account, each on its own API keys (trace/keys.ts): `keys` are the account's, to run
 * the read on. Official accounts (the project's own, given by its owner with rankr_set_official) read on the
 * site's (keys: null), and so does everyone without accounts (local dev). The response to send when the caller
 * isn't signed in.
 */
export async function traceCaller(req: Request): Promise<{ keys: OwnKeys | null } | NextResponse> {
  if (!accountsEnabled()) return { keys: null };
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  if (account.official) return { keys: null };
  try {
    return { keys: await loadKeys(account.id) };
  } catch (err) {
    console.error("[rankr] trace keys unreadable", err);
    return NextResponse.json({ error: "Couldn't read your API keys. Try again." }, { status: 502 });
  }
}
