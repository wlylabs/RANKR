import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER = { id: "00000000-0000-4000-8000-00000000000a", email: "0123456789abcdef0123456789abcdef@key.rankr.invalid" };
const GUEST = { id: "00000000-0000-4000-8000-00000000000b", email: "", is_anonymous: true };
// Signed up by email before keys: keyless, and the address never leaves the server.
const OLD_EMAIL = { id: "00000000-0000-4000-8000-00000000000c", email: "caller@example.com" };

describe("accounts", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let profile: { username: string; official?: boolean }[];

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
        if (auth === "Bearer email-token") return new Response(JSON.stringify(OLD_EMAIL));
        return new Response(JSON.stringify({ msg: "invalid JWT" }), { status: 401 });
      }
      if (url.endsWith("/rest/v1/rpc/rankr_ensure_profile")) {
        profile = [{ username: "nonce_7f3a" }];
        return new Response(JSON.stringify("nonce_7f3a"));
      }
      if (url.includes("/rest/v1/profiles?")) return new Response(JSON.stringify(profile));
      if (url.includes("/auth/v1/admin/users/")) {
        if (init?.method !== "PUT") return new Response("method", { status: 405 });
        return new Response(JSON.stringify({ id: url.split("/").pop(), ...JSON.parse(String(init.body)) }));
      }
      if (url.endsWith("/rest/v1/rpc/rankr_callers")) {
        const caller = { calls: 1, hits: 0, wins: 0, avg_multiple: 1, best_multiple: 1, best_token: null };
        return new Response(
          JSON.stringify({
            total: 2,
            callers: [
              { ...caller, user_id: "u1", username: "rankr", official: true },
              { ...caller, user_id: "u2", username: "degen" },
            ],
          }),
        );
      }
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
    expect(await accountFromRequest(req("good-token"))).toEqual({ id: USER.id, username: "alpha_caller", hasKey: true, official: false });
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
    expect(await accountFromRequest(req("guest-token"))).toEqual({ id: GUEST.id, username: "nonce_7f3a", hasKey: false, official: false });
    expect(urls().filter((u) => u.endsWith("rankr_ensure_profile"))).toHaveLength(1);
    // An existing profile is just read.
    await accountFromRequest(req("good-token"));
    expect(urls().filter((u) => u.endsWith("rankr_ensure_profile"))).toHaveLength(1);
  });

  it("counts an account with a real email as keyless and never returns the email", async () => {
    const { accountFromRequest } = await import("./accounts");
    const account = await accountFromRequest(req("email-token"));
    expect(account).toEqual({ id: OLD_EMAIL.id, username: "alpha_caller", hasKey: false, official: false });
    expect(JSON.stringify(account)).not.toContain("@");
  });

  it("makes a key: the key's email (confirmed) and the key as password, then forgets the cached account", async () => {
    const { accountFromRequest, makeKey } = await import("./accounts");
    const { keyEmail, parseKey } = await import("./key");
    const account = (await accountFromRequest(req("guest-token")))!;
    const key = await makeKey(account);
    expect(parseKey(key)).toBe(key);

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/auth/v1/admin/users/"))!;
    expect(String(call[0])).toBe(`https://x.supabase.co/auth/v1/admin/users/${GUEST.id}`);
    expect(call[1]?.method).toBe("PUT");
    expect(JSON.parse(String(call[1]?.body))).toEqual({ email: await keyEmail(key), password: key, email_confirm: true });
    // The admin call uses the secret key, not the user's token.
    expect(new Headers(call[1]?.headers).get("apikey")).toBe("sb_secret_test");
    expect(new Headers(call[1]?.headers).get("authorization")).toBeNull();

    // A new key each time.
    expect(await makeKey(account)).not.toBe(key);
    // Cache dropped: the next request asks Supabase Auth again.
    await accountFromRequest(req("guest-token"));
    expect(urls().filter((u) => u.endsWith("/auth/v1/user"))).toHaveLength(2);
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

  it("reads the official flag, and an official account keeps its name", async () => {
    profile = [{ username: "rankr", official: true }];
    const { accountFromRequest, setUsername } = await import("./accounts");
    const account = (await accountFromRequest(req("good-token")))!;
    expect(account).toMatchObject({ username: "rankr", official: true });
    expect(await setUsername(account, "bravo")).toEqual({ ok: false, error: "locked" });
    expect(urls().filter((u) => u.endsWith("rankr_set_username"))).toHaveLength(0);
  });

  it("marks official callers on the board", async () => {
    const { callers } = await import("./accounts");
    const out = await callers("hits", 50, 0);
    expect(out.callers.map((c) => [c.username, c.official])).toEqual([
      ["rankr", true],
      ["degen", false],
    ]);
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
