import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER = { id: "00000000-0000-4000-8000-00000000000a", email: "caller@example.com" };
const GUEST = { id: "00000000-0000-4000-8000-00000000000b", email: "", is_anonymous: true };

describe("accounts", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let profile: { username: string }[];

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    profile = [{ username: "alpha_caller" }];
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("authorization");
      if (url.endsWith("/auth/v1/user")) {
        if (auth === "Bearer good-token") return new Response(JSON.stringify(USER));
        if (auth === "Bearer guest-token") return new Response(JSON.stringify(GUEST));
        return new Response(JSON.stringify({ msg: "invalid JWT" }), { status: 401 });
      }
      if (url.endsWith("/rest/v1/rpc/rankr_ensure_profile")) {
        profile = [{ username: "nonce_7f3a" }];
        return new Response(JSON.stringify("nonce_7f3a"));
      }
      if (url.includes("/rest/v1/profiles?")) return new Response(JSON.stringify(profile));
      if (url.endsWith("/rest/v1/rpc/rankr_set_username")) {
        const { p_username } = JSON.parse(String(init?.body));
        if (p_username.toLowerCase() === "taken_name") return new Response(JSON.stringify({ ok: false, error: "taken" }));
        profile = [{ username: p_username }];
        return new Response(JSON.stringify({ ok: true, username: p_username }));
      }
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
  const urls = () => fetchMock.mock.calls.map(([url]) => String(url));

  it("verifies the token with Supabase Auth, reads the username and caches", async () => {
    const { accountFromRequest } = await import("./accounts");
    expect(await accountFromRequest(req("good-token"))).toEqual({ ...USER, username: "alpha_caller", guest: false });
    expect(await accountFromRequest(req("good-token"))).toMatchObject({ id: USER.id });

    expect(urls().filter((u) => u.endsWith("/auth/v1/user"))).toHaveLength(1);
    expect(urls().filter((u) => u.includes("/rest/v1/profiles?"))).toHaveLength(1);
    const [, init] = fetchMock.mock.calls[0];
    // The secret key goes in apikey; the user's token is the bearer.
    expect(new Headers(init?.headers).get("apikey")).toBe("sb_secret_test");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer good-token");
  });

  it("gives a new account its default name, once", async () => {
    profile = [];
    const { accountFromRequest } = await import("./accounts");
    expect(await accountFromRequest(req("guest-token"))).toEqual({ id: GUEST.id, email: null, username: "nonce_7f3a", guest: true });
    expect(urls().filter((u) => u.endsWith("rankr_ensure_profile"))).toHaveLength(1);
    // An existing profile is just read.
    await accountFromRequest(req("good-token"));
    expect(urls().filter((u) => u.endsWith("rankr_ensure_profile"))).toHaveLength(1);
  });

  it("sets a username, refusing bad or taken ones, and forgets the cached account", async () => {
    const { accountFromRequest, setUsername } = await import("./accounts");
    const account = (await accountFromRequest(req("good-token")))!;

    expect(await setUsername(account, "no spaces")).toEqual({ ok: false, error: "invalid" });
    expect(await setUsername(account, "Admin")).toEqual({ ok: false, error: "reserved" });
    expect(await setUsername(account, "taken_name")).toEqual({ ok: false, error: "taken" });
    // Only the one that passed the local rules reached the database.
    expect(urls().filter((u) => u.endsWith("rankr_set_username"))).toHaveLength(1);

    expect(await setUsername(account, "bravo")).toEqual({ ok: true, username: "bravo" });
    expect(await accountFromRequest(req("good-token"))).toMatchObject({ username: "bravo" });
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
