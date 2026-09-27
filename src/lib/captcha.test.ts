import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Options = Record<string, unknown> & { callback: (t: string) => void; "error-callback": () => void };

// Just enough DOM for the module: a body to hold the widget, the theme class on <html>.
function fakeDom(turnstile: unknown) {
  const hosts: { removed: boolean }[] = [];
  vi.stubGlobal("window", { turnstile });
  vi.stubGlobal("document", {
    documentElement: { classList: { contains: (c: string) => c === "dark" } },
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    createElement: () => {
      const el = { removed: false, setAttribute: () => {}, remove: () => (el.removed = true) };
      hosts.push(el);
      return el;
    },
  });
  return hosts;
}

describe("captchaToken", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("is off without a site key", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const { captchaEnabled, captchaToken } = await import("./captcha");
    expect(captchaEnabled).toBe(false);
    expect(await captchaToken()).toBeUndefined();
  });

  it("renders an invisible widget and resolves with its token, then cleans up", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    vi.useFakeTimers();
    let options: Options | undefined;
    const removed: string[] = [];
    const hosts = fakeDom({
      render: (_el: unknown, o: Options) => ((options = o), "w1"),
      remove: (id: string) => removed.push(id),
    });
    const { captchaToken } = await import("./captcha");
    const pending = captchaToken();
    await vi.advanceTimersByTimeAsync(0);
    expect(options).toMatchObject({ sitekey: "1x00000000000000000000AA", appearance: "interaction-only", theme: "dark" });
    options!.callback("XXXX.DUMMY.TOKEN.XXXX");
    await expect(pending).resolves.toBe("XXXX.DUMMY.TOKEN.XXXX");
    await vi.advanceTimersByTimeAsync(0);
    expect(removed).toEqual(["w1"]);
    expect(hosts[0].removed).toBe(true);
  });

  it("rejects with a readable message when the check fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    let options: Options | undefined;
    fakeDom({ render: (_el: unknown, o: Options) => ((options = o), "w1"), remove: () => {} });
    const { captchaToken } = await import("./captcha");
    const pending = captchaToken();
    await Promise.resolve();
    options!["error-callback"]();
    await expect(pending).rejects.toThrow(/human/);
  });
});
