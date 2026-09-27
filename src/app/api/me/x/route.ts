import { NextResponse } from "next/server";
import { verifyX } from "@/lib/accounts";
import { requireAccount } from "@/lib/api-auth";
import { hit, untilReset } from "@/lib/rate-limit";
import type { MeResponse } from "@/lib/types";
import { PostError } from "@/lib/x-post";

export const dynamic = "force-dynamic";

const HOUR = 3_600_000;
const TRIES_PER_HOUR = 10;

/** POST /api/me/x {url} verifies your X account from a link to your post with your code. */
export async function POST(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof NextResponse) return account;
  let url: unknown;
  try {
    ({ url } = await req.json());
  } catch {
    /* handled below */
  }
  if (typeof url !== "string" || url.length > 300) {
    return NextResponse.json({ error: "Paste the link to your post on X." }, { status: 400 });
  }
  // Every try reads X: a few an hour is plenty for a person.
  const quota = await hit(`xverify:user:${account.id}:hour`, HOUR, TRIES_PER_HOUR);
  if (!quota.ok) {
    return NextResponse.json({ error: `Too many tries. Try again in ${untilReset(quota.resetAt)}.`, code: "limit" }, { status: 429 });
  }
  try {
    const out = await verifyX(account, url);
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
    const body: MeResponse = { account: { ...account, about: out.about } };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof PostError) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("[rankr] verify X failed", err);
    return NextResponse.json({ error: "Could not verify your X account. Try again." }, { status: 500 });
  }
}
