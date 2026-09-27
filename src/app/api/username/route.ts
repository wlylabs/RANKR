import { NextResponse, type NextRequest } from "next/server";
import { accountFromRequest, usernameProblem } from "@/lib/accounts";
import { usernameMessage } from "@/lib/username";

export const dynamic = "force-dynamic";

/** GET /api/username?name=... says whether a username is free: {name, available, error?}. */
export async function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  try {
    // Your own current name counts as available to you.
    const me = await accountFromRequest(req).catch(() => null);
    const problem = await usernameProblem(name, me?.id);
    return NextResponse.json(problem ? { name, available: false, code: problem, error: usernameMessage(problem) } : { name, available: true });
  } catch (err) {
    console.error("[rankr] username check failed", err);
    return NextResponse.json({ error: "Could not check that username." }, { status: 500 });
  }
}
