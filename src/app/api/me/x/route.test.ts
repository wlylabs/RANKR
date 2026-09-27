import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostError } from "@/lib/x-post";

const about = { bio: null, x: "alpha_x", xVerified: false, telegram: null };
const account = { id: "u1", username: "nonce_7f3a", hasKey: false, official: false, about };
let over = false;
let outcome: () => Promise<unknown>;

vi.mock("@/lib/api-auth", () => ({ requireAccount: async () => account }));
vi.mock("@/lib/accounts", () => ({ verifyX: () => outcome() }));
vi.mock("@/lib/rate-limit", () => ({
  hit: async () => ({ ok: !over, hits: 1, resetAt: Date.now() + 1_800_000 }),
  untilReset: () => "30m",
}));

const verify = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(new Request("http://x/api/me/x", { method: "POST", body: JSON.stringify(body) }));
};

describe("POST /api/me/x", () => {
  beforeEach(() => {
    over = false;
    outcome = async () => ({ ok: true, about: { ...about, xVerified: true } });
  });

  it("returns the account with the X account verified", async () => {
    const res = await verify({ url: "https://x.com/alpha_x/status/1" });
    expect(res.status).toBe(200);
    expect((await res.json()).account.about).toEqual({ ...about, xVerified: true });
  });

  it("passes on why not, and limits tries", async () => {
    outcome = async () => ({ ok: false, error: "That post is from @b, not @alpha_x.", status: 400 });
    expect(await (await verify({ url: "https://x.com/b/status/1" })).json()).toEqual({ error: "That post is from @b, not @alpha_x." });
    expect((await verify({})).status).toBe(400);
    over = true;
    expect((await verify({ url: "https://x.com/alpha_x/status/1" })).status).toBe(429);
  });

  it("says so when X can't be reached", async () => {
    outcome = async () => {
      throw new PostError("Couldn't reach X right now. Try again in a minute.");
    };
    const res = await verify({ url: "https://x.com/alpha_x/status/1" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/reach X/);
  });
});
