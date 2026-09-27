import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("rate limit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("in memory (no Supabase)", () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv("SUPABASE_URL", "");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    });

    it("lets max hits through per window, then starts over", async () => {
      const { hit } = await import("./rate-limit");
      const t = 1_000_000;
      expect((await hit("b", 60_000, 2, t)).ok).toBe(true);
      expect((await hit("b", 60_000, 2, t + 1)).ok).toBe(true);
      const over = await hit("b", 60_000, 2, t + 2);
      expect(over).toEqual({ ok: false, hits: 3, resetAt: t + 60_000 });
      expect((await hit("other", 60_000, 2, t + 3)).ok).toBe(true);
      expect(await hit("b", 60_000, 2, t + 60_000)).toEqual({ ok: true, hits: 1, resetAt: t + 120_000 });
    });
  });

  describe("in Postgres", () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
      vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    });

    it("uses rankr_rate_hit with the window in seconds", async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, hits: 31, reset_at: "2026-09-28T10:00:00Z" })));
      vi.stubGlobal("fetch", fetchMock);
      const { hit } = await import("./rate-limit");
      expect(await hit("paste:user:u1:day", 86_400_000, 30)).toEqual({ ok: false, hits: 31, resetAt: Date.parse("2026-09-28T10:00:00Z") });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://x.supabase.co/rest/v1/rpc/rankr_rate_hit");
      expect(JSON.parse(String(init.body))).toEqual({ p_bucket: "paste:user:u1:day", p_window_seconds: 86_400, p_max: 30 });
    });

    it("falls back to memory when the function is missing, so pasting keeps working", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "function not found" }), { status: 404 })));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { hit } = await import("./rate-limit");
      expect((await hit("b", 60_000, 1)).ok).toBe(true);
      expect((await hit("b", 60_000, 1)).ok).toBe(false);
    });
  });

  it("says how long until the reset", async () => {
    const { untilReset } = await import("./rate-limit");
    expect(untilReset(40_000, 0)).toBe("40s");
    expect(untilReset(25 * 60_000, 0)).toBe("25m");
    expect(untilReset(3 * 3_600_000 - 5, 0)).toBe("3h");
  });
});
