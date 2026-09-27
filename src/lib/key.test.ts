import { describe, expect, it } from "vitest";
import { KEY_EMAIL_DOMAIN, generateKey, isKeyEmail, keyArt, keyEmail, parseKey } from "./key";

const KEY = "rk-7F3A-K9QX-2MPD-W8HT-ZC4N";

describe("generateKey", () => {
  it("makes rk- and 20 Crockford base32 characters, with a digit and a letter", () => {
    for (let i = 0; i < 200; i++) {
      const key = generateKey();
      expect(key).toMatch(/^rk-([0-9A-HJKMNP-TV-Z]{4}-){4}[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(key.slice(3)).toMatch(/\d/);
      expect(key.slice(3)).toMatch(/[A-Z]/);
      expect(parseKey(key)).toBe(key);
    }
  });

  it("is random", () => {
    expect(new Set(Array.from({ length: 500 }, () => generateKey())).size).toBe(500);
  });

  it("rerolls a key without a digit or without a letter", () => {
    const draws = [new Uint8Array(20).fill(10), new Uint8Array(20).fill(3), Uint8Array.from({ length: 20 }, (_, i) => i)];
    expect(generateKey(() => draws.shift()!)).toBe("rk-0123-4567-89AB-CDEF-GHJK");
    expect(draws).toHaveLength(0);
  });
});

describe("parseKey", () => {
  it("accepts the ways people copy a key", () => {
    for (const input of [
      KEY,
      ` ${KEY} `,
      KEY.toLowerCase(),
      "7F3AK9QX2MPDW8HTZC4N",
      "7f3a k9qx 2mpd w8ht zc4n",
      "RK 7F3A-K9QX-2MPD-W8HT-ZC4N",
      "rk-7F3A-K9QX-2MPD-W8HT-ZC4N\n",
    ]) {
      expect(parseKey(input)).toBe(KEY);
    }
  });

  it("reads look-alike letters as digits", () => {
    expect(parseKey("rk-O000-IIII-LLLL-0000-AAAA")).toBe("rk-0000-1111-1111-0000-AAAA");
  });

  it("rejects anything else", () => {
    for (const input of ["", "rk-", KEY.slice(0, -1), `${KEY}X`, "rk-7F3A-K9QX-2MPD-W8HT-ZC4U", "not a key at all, sorry"]) {
      expect(parseKey(input)).toBeNull();
    }
  });
});

describe("keyEmail", () => {
  it("is a stable made-up address on the key domain", async () => {
    const email = await keyEmail(KEY);
    expect(email).toMatch(new RegExp(`^[0-9a-f]{32}@${KEY_EMAIL_DOMAIN.replace(/\./g, "\\.")}$`));
    expect(await keyEmail(KEY)).toBe(email);
    expect(await keyEmail(parseKey(KEY.toLowerCase())!)).toBe(email);
    expect(await keyEmail(generateKey())).not.toBe(email);
    expect(isKeyEmail(email)).toBe(true);
  });

  it("tells key accounts from the rest", () => {
    expect(isKeyEmail(`ABC@${KEY_EMAIL_DOMAIN.toUpperCase()}`)).toBe(true);
    expect(isKeyEmail("caller@example.com")).toBe(false);
    expect(isKeyEmail(`caller@not${KEY_EMAIL_DOMAIN}`)).toBe(false);
    expect(isKeyEmail("")).toBe(false);
    expect(isKeyEmail(null)).toBe(false);
  });
});

describe("keyArt", () => {
  it("is a mirrored 5x5 pattern, the same for the same key", async () => {
    const cells = await keyArt(KEY);
    expect(await keyArt(KEY)).toEqual(cells);
    for (const [c, r] of cells) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(5);
      expect(cells).toContainEqual([4 - c, r]);
    }
    const others = await Promise.all(Array.from({ length: 20 }, () => keyArt(generateKey())));
    expect(others.some((o) => JSON.stringify(o) !== JSON.stringify(cells))).toBe(true);
  });
});
