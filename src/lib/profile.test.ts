import { describe, expect, it } from "vitest";
import { checkProfile, cleanBio, parsePostId, parseTelegram, parseWebsite, parseX, websiteLabel, xCode, xPostText } from "./profile";

describe("profile fields", () => {
  it("collapses the bio to one trimmed line", () => {
    expect(cleanBio("  Early on\n\ncats.  ")).toBe("Early on cats.");
    expect(cleanBio(" \n ")).toBeNull();
  });

  it("takes an X username as @name, name or a profile link", () => {
    for (const input of ["degen_caller", "@degen_caller", "x.com/degen_caller", "https://twitter.com/degen_caller/", "https://mobile.x.com/degen_caller?s=21"]) {
      expect(parseX(input)).toBe("degen_caller");
    }
    expect(parseX("  ")).toBeNull();
    expect(parseX("way_too_long_for_x")).toBeUndefined();
    expect(parseX("has space")).toBeUndefined();
    expect(parseX("https://x.com/degen/status/123")).toBeUndefined();
  });

  it("takes a Telegram username as @name, name or a t.me link", () => {
    for (const input of ["degencalls", "@degencalls", "t.me/degencalls", "https://t.me/degencalls"]) {
      expect(parseTelegram(input)).toBe("degencalls");
    }
    expect(parseTelegram("abcd")).toBeUndefined();
    expect(parseTelegram("1abcde")).toBeUndefined();
    expect(parseTelegram("")).toBeNull();
  });

  it("takes a website with or without https://, as a full http(s) link", () => {
    expect(parseWebsite("example.com")).toBe("https://example.com");
    expect(parseWebsite(" https://Example.com/ ")).toBe("https://example.com");
    expect(parseWebsite("http://blog.example.co.uk/calls?x=1")).toBe("http://blog.example.co.uk/calls?x=1");
    expect(parseWebsite("münchen.de")).toBe("https://xn--mnchen-3ya.de");
    expect(parseWebsite("")).toBeNull();
    for (const bad of ["javascript:alert(1)", "ftp://example.com", "localhost", "https://127.0.0.1", "https://user:pw@example.com", "exa mple.com", "https://", `example.com/${"a".repeat(200)}`]) {
      expect(parseWebsite(bad), bad).toBeUndefined();
    }
  });

  it("shows a website without the scheme, www. or trailing slash", () => {
    expect(websiteLabel("https://www.example.com")).toBe("example.com");
    expect(websiteLabel("http://example.com/calls/")).toBe("example.com/calls");
  });

  it("checks the whole profile and says which field is wrong", () => {
    const empty = { bio: "", x: "", telegram: "", website: "" };
    expect(checkProfile({ bio: " gm ", x: "@a_b", telegram: "", website: "a.io" })).toEqual({
      ok: true,
      profile: { bio: "gm", x: "a_b", telegram: null, website: "https://a.io" },
    });
    expect(checkProfile({ ...empty, bio: "é".repeat(160) }).ok).toBe(true);
    expect(checkProfile({ ...empty, bio: "é".repeat(161) })).toMatchObject({ ok: false, field: "bio" });
    expect(checkProfile({ ...empty, x: "no spaces here" })).toMatchObject({ ok: false, field: "x" });
    expect(checkProfile({ ...empty, telegram: "abc" })).toMatchObject({ ok: false, field: "telegram" });
    expect(checkProfile({ ...empty, website: "javascript:alert(1)" })).toMatchObject({ ok: false, field: "website" });
  });
});

describe("X verification", () => {
  const user = "00000000-0000-4000-8000-00000000000a";

  it("ties the code to the account and the X account, in any case", () => {
    const code = xCode(user, "Degen_Caller");
    expect(code).toMatch(/^rankr-[0-9a-f]{10}$/);
    expect(xCode(user, "degen_caller")).toBe(code);
    expect(xCode(user, "someone_else")).not.toBe(code);
    expect(xCode("00000000-0000-4000-8000-00000000000b", "degen_caller")).not.toBe(code);
    expect(xPostText(code, "https://rankr.example/u/nonce_7f3a")).toContain(code);
  });

  it("reads the post id from links to a post", () => {
    for (const link of [
      "https://x.com/degen_caller/status/1840000000000000001",
      "https://twitter.com/degen_caller/status/1840000000000000001?s=20&t=abc",
      "x.com/degen_caller/status/1840000000000000001/photo/1",
      " https://mobile.twitter.com/i/web/status/1840000000000000001 ",
      "https://x.com/i/status/1840000000000000001",
    ]) {
      expect(parsePostId(link)).toBe("1840000000000000001");
    }
    for (const bad of ["1840000000000000001", "https://x.com/degen_caller", "https://evil.example/x.com/a/status/1", "https://x.com.evil.example/a/status/1"]) {
      expect(parsePostId(bad)).toBeNull();
    }
  });
});
