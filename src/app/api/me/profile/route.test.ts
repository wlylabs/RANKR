import { describe, expect, it, vi } from "vitest";

const account = {
  id: "u1",
  username: "nonce_7f3a",
  hasKey: false,
  official: false,
  about: { bio: null, x: null, xVerified: false, telegram: null, website: null },
};
const saved: unknown[] = [];

vi.mock("@/lib/api-auth", () => ({ requireAccount: async () => account }));
vi.mock("@/lib/accounts", () => ({
  setProfile: async (_account: unknown, profile: Record<string, string | null>) => {
    saved.push(profile);
    return { ...profile, xVerified: false };
  },
}));

const save = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(new Request("http://x/api/me/profile", { method: "POST", body: JSON.stringify(body) }));
};

describe("POST /api/me/profile", () => {
  it("saves the cleaned-up profile", async () => {
    const res = await save({ bio: "  gm\n", x: "https://x.com/alpha_x", telegram: "@alpha_tg", website: "alpha.example" });
    expect(res.status).toBe(200);
    const profile = { bio: "gm", x: "alpha_x", telegram: "alpha_tg", website: "https://alpha.example" };
    expect(saved).toEqual([profile]);
    expect((await res.json()).account.about).toEqual({ ...profile, xVerified: false });
  });

  it("says which field is wrong, and saves nothing", async () => {
    const res = await save({ bio: "", x: "not a handle", telegram: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "x" });
    expect(saved).toHaveLength(1);
  });
});
