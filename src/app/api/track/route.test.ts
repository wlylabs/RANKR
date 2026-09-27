import { beforeEach, describe, expect, it, vi } from "vitest";

const account = { id: "u1", username: "nonce_7f3a", hasKey: false, official: false };
const hits: string[] = [];
let over: string | null = null;

vi.mock("@/lib/accounts", () => ({
  AuthError: class extends Error {},
  accountsEnabled: () => true,
  accountFromRequest: async () => account,
  recordCall: async () => null,
}));
vi.mock("@/lib/rankr", () => ({
  RankrError: class extends Error {},
  trackToken: async () => ({ status: "created", token: { id: "solana:x" } }),
}));
vi.mock("@/lib/rate-limit", () => ({
  hit: async (bucket: string) => {
    hits.push(bucket);
    return { ok: bucket !== over, hits: 1, resetAt: Date.now() + 5 * 3_600_000 };
  },
  untilReset: () => "5h",
}));

const CA = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
const paste = async (input: string) => {
  const { POST } = await import("./route");
  return POST(new Request("http://x/api/track", { method: "POST", body: JSON.stringify({ input }), headers: { "x-forwarded-for": "203.0.113.7" } }));
};

describe("POST /api/track limits", () => {
  beforeEach(() => {
    hits.length = 0;
    over = null;
    Object.assign(account, { hasKey: false, official: false });
  });

  it("checks the IP burst limit and the account's daily quota", async () => {
    expect((await paste(CA)).status).toBe(201);
    expect(hits).toEqual(["paste:ip:203.0.113.7", "paste:user:u1:day"]);
  });

  it("tells a guest over the daily limit to save a key", async () => {
    over = "paste:user:u1:day";
    const res = await paste(CA);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe("limit");
    expect(body.error).toMatch(/Guests can paste 30 times a day\. Save your key to get 200/);
  });

  it("stops bursts from one IP before anything else", async () => {
    over = "paste:ip:203.0.113.7";
    const res = await paste(CA);
    expect(res.status).toBe(429);
    expect(hits).toEqual(["paste:ip:203.0.113.7"]);
  });

  it("doesn't spend the quota on input that isn't a CA, and official accounts have none", async () => {
    expect((await paste("hello there")).status).toBe(400);
    expect(hits).toEqual(["paste:ip:203.0.113.7"]);
    hits.length = 0;
    account.official = true;
    expect((await paste(CA)).status).toBe(201);
    expect(hits).toEqual(["paste:ip:203.0.113.7"]);
  });
});
