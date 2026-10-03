import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ open: true }));
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireTraceAccess: async () =>
      state.open ? null : NextResponse.json({ error: "Trace is private for now.", code: "private" }, { status: 403 }),
  };
});

const get = async () => {
  const { GET } = await import("./route");
  return GET(new NextRequest("http://x/api/trace/usage"));
};

describe("GET /api/trace/usage", () => {
  it("lists the budgets, never cached", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resources.map((r: { id: string }) => r.id)).toContain("geckoterminal");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("is for official accounts only", async () => {
    state.open = false;
    expect((await get()).status).toBe(403);
    state.open = true;
  });
});
