import { NextResponse } from "next/server";
import { refreshStale } from "@/lib/rankr";

export const dynamic = "force-dynamic";

/**
 * Refreshes the stalest tokens so peaks / lows are recorded even when nobody is browsing.
 * Call it every minute from Supabase pg_cron (supabase/cron.sql) or any scheduler, with
 * `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends that header on its own).
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret ? req.headers.get("authorization") !== `Bearer ${secret}` : process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ refreshed: await refreshStale() });
  } catch (err) {
    console.error("[rankr] cron refresh failed", err);
    return NextResponse.json({ error: "Refresh failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
