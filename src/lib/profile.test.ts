import { describe, expect, it } from "vitest";
import { BIO_MAX, LINKS_MAX, checkProfile, cleanText, displayUrl, hostOf, linksText, normalizeUrl } from "./profile";

describe("normalizeUrl", () => {
  it("adds https:// when there is no scheme and drops a bare trailing slash", () => {
    expect(normalizeUrl("x.com/degen")).toBe("https://x.com/degen");
    expect(normalizeUrl("  t.me/rankr_calls ")).toBe("https://t.me/rankr_calls");
    expect(normalizeUrl("https://Example.COM/")).toBe("https://example.com");
    expect(normalizeUrl("http://example.com/a?b=1#c")).toBe("http://example.com/a?b=1#c");
    expect(normalizeUrl("https://medium.com/@degen")).toBe("https://medium.com/@degen");
  });

  it("spells international hosts in punycode, so look-alikes show", () => {
    // Cyrillic letters that read as "paypal".
    expect(normalizeUrl("https://раураl.com/login")).toMatch(/^https:\/\/xn--[a-z0-9-]+\.com\/login$/);
  });

  it("refuses anything that isn't an http(s) link to a named host", () => {
    for (const bad of [
      "",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,hi",
      "ftp://example.com",
      "https://me:pw@evil.com",
      "https://me@evil.com",
      "localhost",
      "@degen",
      "https://x.com/a b",
      `https://x.com/${"a".repeat(200)}`,
    ]) {
      expect(normalizeUrl(bad), bad).toBeNull();
    }
  });
});

describe("checkProfile", () => {
  it("cleans the bio and links, and drops blank rows", () => {
    expect(
      checkProfile({
        bio: "  Low caps\n only.‮ ",
        links: [
          { label: " X ", url: "x.com/degen" },
          { label: "", url: "" },
          { label: "", url: "t.me/degen" },
        ],
      }),
    ).toEqual({
      ok: true,
      profile: {
        bio: "Low caps only.",
        links: [
          { label: "X", url: "https://x.com/degen" },
          { label: "", url: "https://t.me/degen" },
        ],
      },
    });
    expect(checkProfile({})).toEqual({ ok: true, profile: { bio: "", links: [] } });
  });

  it("counts characters, not UTF-16 units, like SQL", () => {
    expect(checkProfile({ bio: "🐸".repeat(BIO_MAX) }).ok).toBe(true);
    expect(checkProfile({ bio: "a".repeat(BIO_MAX + 1) })).toEqual({ ok: false, error: "bio_long" });
  });

  it("says which link is wrong", () => {
    expect(checkProfile({ links: [{ label: "", url: "x.com" }, { label: "", url: "javascript:alert(1)" }] })).toEqual({
      ok: false,
      error: "bad_url",
      index: 1,
    });
    expect(checkProfile({ links: [{ label: "a".repeat(33), url: "x.com" }] })).toEqual({ ok: false, error: "label_long", index: 0 });
    expect(checkProfile({ links: [{ label: "Only a name", url: "" }] })).toMatchObject({ error: "bad_url" });
  });

  it("caps the number of links", () => {
    const links = Array.from({ length: LINKS_MAX + 1 }, (_, i) => ({ label: "", url: `x.com/${i}` }));
    expect(checkProfile({ links: links.slice(0, LINKS_MAX) }).ok).toBe(true);
    expect(checkProfile({ links })).toEqual({ ok: false, error: "too_many" });
  });

  it("refuses the wrong shapes", () => {
    expect(checkProfile({ bio: 5 })).toMatchObject({ error: "invalid" });
    expect(checkProfile({ links: "x.com" })).toMatchObject({ error: "invalid" });
    expect(checkProfile({ links: ["x.com"] })).toMatchObject({ error: "invalid", index: 0 });
    expect(checkProfile({ links: [{ label: 1, url: "x.com" }] })).toMatchObject({ error: "invalid", index: 0 });
  });
});

describe("display helpers", () => {
  it("shows the link without its scheme, the real host, and every link on its own line", () => {
    expect(displayUrl("https://www.example.com/a")).toBe("example.com/a");
    expect(hostOf("https://www.example.com/a")).toBe("example.com");
    expect(linksText([{ label: "X", url: "https://x.com/degen" }, { label: "", url: "https://t.me/degen" }])).toBe(
      "X: https://x.com/degen\nhttps://t.me/degen",
    );
    expect(cleanText("a\t\tb‎ c")).toBe("a b c");
  });
});
