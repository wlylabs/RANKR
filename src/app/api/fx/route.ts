import { NextResponse } from "next/server";
import { usdIdr } from "@/lib/fx";
import type { FxResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/fx -> rupiah per dollar (null when no source answers), for paper trades in IDR. */
export async function GET() {
  const body: FxResponse = { rate: await usdIdr().catch(() => null) };
  return NextResponse.json(body, {
    headers: { "cache-control": body.rate ? "public, max-age=3600, s-maxage=3600" : "no-store" },
  });
}
