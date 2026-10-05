import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: true,
  account: null as { id: string; official: boolean; hasKey?: boolean } | null,
}));
vi.mock("./accounts", () => ({
  AuthError: class extends Error {},
  accountsEnabled: () => state.enabled,
  accountFromRequest: async () => state.account,
}));
vi.mock("./trace-allowance", () => ({
  takeAllowance: async (_id: string, guest: boolean) => !guest,
}));
vi.mock("./trace-keys", () => ({
  loadKeys: async (userId: string) => ({ userId, blockscout: "bs-key-123", helius: null }),
}));

const { traceCaller } = await import("./api-auth");
const req = () => new Request("http://x/api/trace/solana/W");

describe("traceCaller", () => {
  it("runs an official account on the site's keys", async () => {
    state.account = { id: "o", official: true };
    expect(await traceCaller(req())).toEqual({ keys: null });
  });

  it("runs every other account on its own keys, with its free allowance (smaller for a guest)", async () => {
    state.account = { id: "u1", official: false, hasKey: true };
    const out = await traceCaller(req());
    if (out instanceof Response || !out.keys) throw new Error("expected keys");
    expect(out.keys).toMatchObject({ userId: "u1", blockscout: "bs-key-123", helius: null });
    expect(await out.keys.allowance?.("wallet")).toBe(true);
    state.account = { id: "g", official: false, hasKey: false };
    const guest = await traceCaller(req());
    if (guest instanceof Response || !guest.keys) throw new Error("expected keys");
    expect(await guest.keys.allowance?.("wallet")).toBe(false);
  });

  it("asks anyone signed out to sign in", async () => {
    state.account = null;
    const res = await traceCaller(req());
    expect(res instanceof Response && res.status).toBe(401);
  });

  it("is open on the site's keys without accounts (local dev), like pasting", async () => {
    state.enabled = false;
    state.account = null;
    expect(await traceCaller(req())).toEqual({ keys: null });
    state.enabled = true;
  });
});
