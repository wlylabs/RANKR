import { afterEach, describe, expect, it } from "vitest";
import { open, seal } from "./secret-box";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("secret box", () => {
  it("opens what it sealed, and nothing sealed under another secret", () => {
    process.env.TRACE_KEYS_SECRET = "one";
    const box = seal("my-api-key");
    expect(box).toMatch(/^v1:/);
    expect(box).not.toContain("my-api-key");
    expect(open(box)).toBe("my-api-key");
    expect(seal("my-api-key")).not.toBe(box); // a fresh IV each time
    process.env.TRACE_KEYS_SECRET = "two";
    expect(open(box)).toBeNull();
    expect(open("v1:garbage")).toBeNull();
    expect(open(null)).toBeNull();
  });
});
