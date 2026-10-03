import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: true,
  account: null as { official: boolean } | null,
}));
vi.mock("./accounts", () => ({
  AuthError: class extends Error {},
  accountsEnabled: () => state.enabled,
  accountFromRequest: async () => state.account,
}));

const { requireTraceAccess } = await import("./api-auth");
const req = () => new Request("http://x/api/trace/solana/W");

describe("requireTraceAccess", () => {
  it("lets an official account in", async () => {
    state.account = { official: true };
    expect(await requireTraceAccess(req())).toBeNull();
  });

  it("keeps everyone else out: signed out 401, any other account 403", async () => {
    state.account = null;
    expect((await requireTraceAccess(req()))?.status).toBe(401);
    state.account = { official: false };
    const res = await requireTraceAccess(req());
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "Trace is private for now.", code: "private" });
  });

  it("is open without accounts (local dev), like pasting", async () => {
    state.enabled = false;
    state.account = null;
    expect(await requireTraceAccess(req())).toBeNull();
    state.enabled = true;
  });
});
