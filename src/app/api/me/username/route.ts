import { NextResponse } from "next/server";
import { setUsername } from "@/lib/accounts";
import { requireAccount } from "@/lib/api-auth";
import type { MeResponse } from "@/lib/types";
import { usernameMessage } from "@/lib/username";

export const dynamic = "force-dynamic";

/** POST /api/me/username {username} picks or changes your public username. */
export async function POST(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  let username: unknown;
  try {
    ({ username } = await req.json());
  } catch {
    /* handled below */
  }
  if (typeof username !== "string") return NextResponse.json({ error: usernameMessage("invalid") }, { status: 400 });
  try {
    const out = await setUsername(account, username.trim());
    if (!out.ok) {
      return NextResponse.json({ error: usernameMessage(out.error), code: out.error }, { status: out.error === "taken" ? 409 : 400 });
    }
    const body: MeResponse = { account: { ...account, username: out.username } };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[rankr] set username failed", err);
    return NextResponse.json({ error: "Could not save your username." }, { status: 500 });
  }
}
