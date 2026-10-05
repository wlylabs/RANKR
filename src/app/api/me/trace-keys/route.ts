import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/api-auth";
import { hit, untilReset } from "@/lib/rate-limit";
import { keysView, saveKeys, type KeysChange } from "@/lib/trace-keys";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/me/trace-keys -> your own Trace keys, by their last characters only (never the keys), and today's free reads. */
export async function GET(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  try {
    return NextResponse.json(await keysView(account), { headers: NO_STORE });
  } catch (err) {
    console.error("[rankr] trace keys read failed", err);
    return NextResponse.json({ error: "Couldn't read your API keys." }, { status: 502 });
  }
}

/**
 * POST /api/me/trace-keys {blockscout?, helius?} saves your own Trace keys: a key to add or replace one, null to
 * remove it, left out to keep it. Each is checked with its provider first. Answers like GET.
 */
export async function POST(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  // Each save asks the providers whether the keys work.
  const quota = await hit(`trace-keys:user:${account.id}`, 60_000, 10);
  if (!quota.ok)
    return NextResponse.json({ error: `Slow down a bit. Try again in ${untilReset(quota.resetAt)}.` }, { status: 429 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const change: KeysChange = {};
  for (const name of ["blockscout", "helius"] as const) {
    const v = body[name];
    if (v === null || v === "") change[name] = null;
    else if (typeof v === "string") change[name] = v.slice(0, 500);
  }
  try {
    const out = await saveKeys(account.id, change);
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json(await keysView(account), { headers: NO_STORE });
  } catch (err) {
    console.error("[rankr] trace keys save failed", err);
    return NextResponse.json({ error: "Couldn't save your API keys. Try again." }, { status: 500 });
  }
}
