import { NextResponse } from "next/server";
import { getToken } from "@/lib/rankr";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await ctx.params;
  try {
    return NextResponse.json(await getToken(chain, address));
  } catch (err) {
    console.error("[rankr] token lookup failed", err);
    return NextResponse.json({ error: "Could not load token." }, { status: 500 });
  }
}
