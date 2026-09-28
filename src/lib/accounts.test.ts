import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER = { id: "00000000-0000-4000-8000-00000000000a", email: "0123456789abcdef0123456789abcdef@key.rankr.invalid" };
const GUEST = { id: "00000000-0000-4000-8000-00000000000b", email: "", is_anonymous: true };
// Signed up by email before keys: keyless, and the address never leaves the server.
const OLD_EMAIL = { id: "00000000-0000-4000-8000-00000000000c", email: "caller@example.com" };
const NO_ABOUT = { bio: null, x: null, xVerified: false, telegram: null, website: null };

type ProfileRow = {
  username: string;
  official?: boolean;
  bio?: string | null;
  x_handle?: string | null;
  x_verified_at?: string | null;
  telegram?: string | null;
  website?: string | null;
};

describe("accounts", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let profile: ProfileRow[];
  let feedArgs: Record<string, unknown> | null;
  let rankArgs: Record<string, unknown> | null;
  let verifyOk: boolean;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    profile = [{ username: "alpha_caller" }];
    feedArgs = null;
    rankArgs = null;
    verifyOk = true;
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
      if (url.endsWith("/rest/v1/rpc/rankr_caller_rank")) {
        rankArgs = JSON.parse(String(init?.body));
        const caller = { calls: 6, hits: 2, wins: 3, avg_multiple: 1.8, best_multiple: 4.2, official: false };
        return new Response(
          JSON.stringify({
            total: 12,
            calls: 6,
            rank: 4,
            caller: { ...caller, user_id: USER.id, username: "alpha_caller",
                      best_token: { id: "solana:ZZZ", address: "ZZZ", symbol: "ZED", name: "Zed", chain_id: "solana" } },
            ahead: { ...caller, user_id: "u2", username: "degen", hits: 3, best_token: null },
          }),
        );
      }
      if (url.endsWith("/rest/v1/rpc/rankr_feed")) {
        feedArgs = JSON.parse(String(init?.body));
        const now = new Date().toISOString();
        const token = {
          id: "solana:ZZZ", chain_id: "solana", address: "ZZZ", name: "Zed", symbol: "ZED", image_url: null,
          entry_price_usd: 1, entry_market_cap: 1000, first_pasted_at: now, last_pasted_at: now, paste_count: 1,
          peak_price_usd: 12, peak_at: now, low_price_usd: 1, low_at: now, last_price_usd: 12,
          market: { priceUsd: 12 }, last_checked_at: now,
        };
        return new Response(
          JSON.stringify([
            { kind: "milestone", tier: 10, at: "2026-09-27T11:17:50.571+00:00", user_id: "u1", token_id: "solana:ZZZ",
              entry_price_usd: 2, entry_market_cap: 2000, called_at: now, username: "degen", official: false,
              caller_calls: 8, caller_hits: 5, token },
          ]),
        );
      }
      if (url.endsWith("/rest/v1/rpc/rankr_set_username")) {
        const { p_username } = JSON.parse(String(init?.body));
        if (p_username.toLowerCase() === "taken_name") return new Response(JSON.stringify({ ok: false, error: "taken" }));
        profile = [{ username: p_username }];
        return new Response(JSON.stringify({ ok: true, username: p_username }));
      }
      if (url.endsWith("/rest/v1/rpc/rankr_set_profile")) {
        const { p_bio, p_x, p_telegram, p_website } = JSON.parse(String(init?.body));
        const kept = profile[0].x_handle?.toLowerCase() === p_x?.toLowerCase() ? profile[0].x_verified_at : null;
        profile = [{ ...profile[0], bio: p_bio, x_handle: p_x, x_verified_at: kept, telegram: p_telegram, website: p_website }];
        return new Response(
          JSON.stringify({ ok: true, bio: p_bio, x: p_x, x_verified: !!kept, telegram: p_telegram, website: p_website }),
        );
      }
      if (url.endsWith("/rest/v1/rpc/rankr_verify_x")) {
        if (verifyOk) profile = [{ ...profile[0], x_verified_at: "2026-09-27T12:00:00Z" }];
        return new Response(JSON.stringify(verifyOk ? { ok: true } : { ok: false, error: "changed" }));
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
    expect(await accountFromRequest(req("good-token"))).toEqual({ id: USER.id, username: "alpha_caller", hasKey: true, official: false, about: NO_ABOUT });
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
    expect(await accountFromRequest(req("guest-token"))).toEqual({ id: GUEST.id, username: "nonce_7f3a", hasKey: false, official: false, about: NO_ABOUT });
    expect(urls().filter((u) => u.endsWith("rankr_ensure_profile"))).toHaveLength(1);
    // An existing profile is just read.
    await accountFromRequest(req("good-token"));
    expect(urls().filter((u) => u.endsWith("rankr_ensure_profile"))).toHaveLength(1);
  });

  it("counts an account with a real email as keyless and never returns the email", async () => {
    const { accountFromRequest } = await import("./accounts");
    const account = await accountFromRequest(req("email-token"));
    expect(account).toEqual({ id: OLD_EMAIL.id, username: "alpha_caller", hasKey: false, official: false, about: NO_ABOUT });
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

  it("reads the bio and links, saves them and forgets the cached account", async () => {
    profile = [{ username: "alpha_caller", bio: "gm", x_handle: "Alpha_X", x_verified_at: "2026-09-27T12:00:00Z", telegram: null }];
    const { accountFromRequest, setProfile } = await import("./accounts");
    const account = (await accountFromRequest(req("good-token")))!;
    expect(account.about).toEqual({ bio: "gm", x: "Alpha_X", xVerified: true, telegram: null, website: null });
    expect(urls().find((u) => u.includes("/rest/v1/profiles?"))).toContain("select=*");

    // Same X account in another case: still verified.
    const saved = { bio: "Early on cats.", x: "alpha_x", telegram: "alpha_tg", website: "https://alpha.example" };
    expect(await setProfile(account, saved)).toEqual({ ...saved, xVerified: true });
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("rankr_set_profile"))!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      p_user: USER.id,
      p_bio: "Early on cats.",
      p_x: "alpha_x",
      p_telegram: "alpha_tg",
      p_website: "https://alpha.example",
    });
    // Another one starts over.
    expect((await setProfile(account, { bio: null, x: "bravo_x", telegram: null, website: null }))?.xVerified).toBe(false);
    expect((await accountFromRequest(req("good-token")))?.about).toEqual({ ...NO_ABOUT, x: "bravo_x" });
  });

  it("verifies the X account from a public post by that account with the account's code", async () => {
    profile = [{ username: "alpha_caller", x_handle: "Alpha_X" }];
    const { accountFromRequest, verifyX } = await import("./accounts");
    const { xCode } = await import("./profile");
    const account = (await accountFromRequest(req("good-token")))!;
    const code = xCode(USER.id, "alpha_x");
    const link = "https://x.com/Alpha_X/status/1840000000000000001";
    const post = (author: string, text: string) => async (id: string) => (id === "1840000000000000001" ? { author, text } : null);

    expect(await verifyX(account, "https://x.com/Alpha_X", post("Alpha_X", code))).toMatchObject({ ok: false, status: 400 });
    expect(await verifyX(account, "https://x.com/Alpha_X/status/2", post("Alpha_X", code))).toMatchObject({ ok: false, status: 404 });
    expect(await verifyX(account, link, post("someone_else", code))).toEqual({
      ok: false,
      error: "That post is from @someone_else, not @Alpha_X.",
      status: 400,
    });
    // A code for another Rankr account proves nothing.
    expect(await verifyX(account, link, post("alpha_x", xCode(GUEST.id, "alpha_x")))).toMatchObject({ ok: false, status: 400 });
    expect(urls().filter((u) => u.endsWith("rankr_verify_x"))).toHaveLength(0);

    expect(await verifyX(account, link, post("alpha_x", `gm\n${code.toUpperCase()}`))).toEqual({
      ok: true,
      about: { ...NO_ABOUT, x: "Alpha_X", xVerified: true },
    });
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("rankr_verify_x"))!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ p_user: USER.id, p_x: "Alpha_X" });
    expect((await accountFromRequest(req("good-token")))?.about.xVerified).toBe(true);
  });

  it("won't verify without an X account, or when it changed meanwhile", async () => {
    const { accountFromRequest, verifyX } = await import("./accounts");
    const { xCode } = await import("./profile");
    const link = "https://x.com/alpha_x/status/1";
    const read = async () => ({ author: "alpha_x", text: `${xCode(USER.id, "alpha_x")} ${xCode(GUEST.id, "alpha_x")}` });
    expect(await verifyX((await accountFromRequest(req("good-token")))!, link, read)).toMatchObject({ ok: false, status: 400 });

    profile = [{ username: "nonce_7f3a", x_handle: "alpha_x" }];
    verifyOk = false;
    expect(await verifyX((await accountFromRequest(req("guest-token")))!, link, read)).toMatchObject({ ok: false, status: 409 });
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
  it("reads the feed: milestones measured from the caller's own entry, with their board numbers", async () => {
    const { feed } = await import("./accounts");
    const items = await feed({ limit: 20, offset: 0, users: ["u1"], chain: "solana", kind: "milestone" });
    expect(feedArgs).toEqual({ p_limit: 20, p_offset: 0, p_users: ["u1"], p_chain: "solana", p_kind: "milestone" });
    expect(items).toEqual([
      {
        id: "milestone:u1:solana:ZZZ:10",
        kind: "milestone",
        tier: 10,
        at: Date.parse("2026-09-27T11:17:50.571Z"),
        username: "degen",
        official: false,
        caller: { calls: 8, hits: 5 },
        token: { id: "solana:ZZZ", chainId: "solana", address: "ZZZ", symbol: "ZED", name: "Zed" },
        entryMarketCap: 2000,
        multiple: 6, // price 12, this caller's entry 2
      },
    ]);
  });

  it("reads a caller's place on the board with the board's minimum calls", async () => {
    const { callerRank } = await import("./accounts");
    const out = await callerRank(USER.id, "rate");
    expect(rankArgs).toEqual({ p_user: USER.id, p_sort: "rate", p_min_calls: 5 });
    expect(out).toMatchObject({ total: 12, calls: 6, rank: 4 });
    expect(out.caller).toMatchObject({ userId: USER.id, username: "alpha_caller", hits: 2, avgMultiple: 1.8 });
    expect(out.caller?.bestToken).toEqual({ id: "solana:ZZZ", address: "ZZZ", symbol: "ZED", name: "Zed", chainId: "solana" });
    expect(out.ahead).toMatchObject({ userId: "u2", username: "degen", hits: 3, bestToken: null });

    await callerRank(USER.id, "hits");
    expect(rankArgs).toMatchObject({ p_sort: "hits", p_min_calls: 1 });
  });

  it("asks nothing for an empty list of callers", async () => {
    const { feed } = await import("./accounts");
    expect(await feed({ limit: 20, offset: 0, users: [], chain: null, kind: null })).toEqual([]);
    expect(feedArgs).toBeNull();
  });
});

describe("callerProfile", () => {
  let urls: string[];
  let rows: (ProfileRow & { user_id: string })[];

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    urls = [];
    rows = [{ user_id: "u1", username: "nonce_7f3a" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("/rest/v1/profiles?")) return new Response(JSON.stringify(rows));
        if (url.endsWith("/rest/v1/rpc/rankr_my_calls")) return new Response("[]");
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("finds a caller by name in any case, matching underscores literally", async () => {
    const { callerProfile } = await import("./accounts");
    const out = await callerProfile("NONCE_7F3A");
    expect(out?.caller).toMatchObject({ userId: "u1", username: "nonce_7f3a", calls: 0, bestToken: null });
    expect(urls[0]).toContain("username=ilike.NONCE%5C_7F3A");
  });

  it("shows the bio and Telegram, and the X account only once verified", async () => {
    const { callerProfile } = await import("./accounts");
    rows = [
      { user_id: "u1", username: "nonce_7f3a", bio: "gm", x_handle: "someone_famous", x_verified_at: null, telegram: "nonce_tg", website: "https://nonce.example" },
    ];
    const about = { bio: "gm", telegram: "nonce_tg", website: "https://nonce.example" };
    expect((await callerProfile("nonce_7f3a"))?.about).toEqual({ ...about, x: null, xVerified: false });
    rows[0].x_verified_at = "2026-09-27T12:00:00Z";
    expect((await callerProfile("nonce_7f3a"))?.about).toEqual({ ...about, x: "someone_famous", xVerified: true });
  });

  it("returns null for unknown or impossible names", async () => {
    const { callerProfile } = await import("./accounts");
    rows = [{ user_id: "u2", username: "nonceX7f3a" }]; // what an unescaped "_" would also match
    expect(await callerProfile("nonce_7f3a")).toBeNull();
    expect(await callerProfile("no spaces!")).toBeNull();
    expect(urls).toHaveLength(1);
  });
});

describe("lastSeason", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads the last month that ended, with callers by the names they have now", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    const urls: string[] = [];
    const caller = { user_id: "u1", username: "old_name", official: false, calls: 8, hits: 5, wins: 6, avg_multiple: 3, best_multiple: 12, best_token: null };
    const token = { id: "solana:ZZZ", chain_id: "solana", address: "ZZZ", symbol: "ZED", name: "Zed", entry_market_cap: 1000, peak_multiple: 40, multiple: 2, first_caller: "u1" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("/rest/v1/seasons?")) {
          return new Response(
            JSON.stringify([
              { month: "2026-09-01", ended_at: "2026-10-01T00:00:00+00:00", counts: { tokens: 120, calls: 300, callers: 40 }, callers: [caller], tokens: [token] },
            ]),
          );
        }
        if (url.includes("/rest/v1/profiles?")) return new Response(JSON.stringify([{ user_id: "u1", username: "new_name", official: true }]));
        return new Response("not found", { status: 404 });
      }),
    );
    const { lastSeason } = await import("./accounts");
    expect(await lastSeason()).toEqual({
      month: "2026-09-01",
      endedAt: Date.parse("2026-10-01T00:00:00Z"),
      counts: { tokens: 120, calls: 300, callers: 40 },
      callers: [{ userId: "u1", username: "new_name", official: true, calls: 8, hits: 5, avgMultiple: 3, bestMultiple: 12 }],
      tokens: [{ id: "solana:ZZZ", chainId: "solana", address: "ZZZ", symbol: "ZED", name: "Zed", entryMarketCap: 1000, peakMultiple: 40, firstCaller: "new_name" }],
    });
    expect(urls[0]).toContain("seasons?select=*&order=ended_at.desc&limit=1");
    expect(urls[1]).toContain("user_id=in.(u1)");
  });
});
