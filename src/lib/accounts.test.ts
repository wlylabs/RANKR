import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER = {
  id: "00000000-0000-4000-8000-00000000000a",
  identities: [{ provider: "web3", provider_id: "web3:solana:WalletA111" }],
};

describe("accountFromRequest", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("authorization");
      if (url.endsWith("/auth/v1/user")) {
        return auth === "Bearer good-token"
          ? new Response(JSON.stringify(USER))
          : new Response(JSON.stringify({ msg: "invalid JWT" }), { status: 401 });
      }
      if (url.endsWith("/rest/v1/rpc/rankr_upsert_profile")) return new Response("");
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const req = (token?: string) =>
    new Request("http://app/api/me", token ? { headers: { authorization: `Bearer ${token}` } } : {});

  it("verifies the token with Supabase Auth, upserts the profile once and caches", async () => {
    const { accountFromRequest } = await import("./accounts");
    expect(await accountFromRequest(req("good-token"))).toEqual({
      id: USER.id,
      wallet: { chain: "solana", address: "WalletA111" },
    });
    expect(await accountFromRequest(req("good-token"))).toMatchObject({ id: USER.id });

    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls.filter((u) => u.endsWith("/auth/v1/user"))).toHaveLength(1);
    expect(calls.filter((u) => u.endsWith("rankr_upsert_profile"))).toHaveLength(1);
    const [, init] = fetchMock.mock.calls[0];
    // The secret key goes in apikey; the user's token is the bearer.
    expect(new Headers(init?.headers).get("apikey")).toBe("sb_secret_test");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer good-token");
  });

  it("is null without a token and rejects bad tokens", async () => {
    const { AuthError, accountFromRequest } = await import("./accounts");
    expect(await accountFromRequest(req())).toBeNull();
    await expect(accountFromRequest(req("forged"))).rejects.toBeInstanceOf(AuthError);
  });

  it("is off without Supabase", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const { accountFromRequest, accountsEnabled } = await import("./accounts");
    expect(accountsEnabled()).toBe(false);
    expect(await accountFromRequest(req("good-token"))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
