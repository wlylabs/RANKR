import { describe, expect, it } from "vitest";
import { authErrorMessage, loginHref, loginToPaste, safeNext } from "./login";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/me")).toBe("/me");
    expect(safeNext("/?ca=abc")).toBe("/?ca=abc");
  });

  it("drops anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});

describe("loginHref", () => {
  it("adds next only when it goes somewhere", () => {
    expect(loginHref()).toBe("/login");
    expect(loginHref("/")).toBe("/login");
    expect(loginHref("/me")).toBe("/login?next=%2Fme");
    expect(loginHref("//evil.example")).toBe("/login");
  });

  it("carries a pasted CA through sign-in", () => {
    const href = loginToPaste(" 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr ");
    const next = new URL(href, "http://x").searchParams.get("next");
    expect(next).toBe("/?ca=7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr");
    expect(new URL(next!, "http://x").searchParams.get("ca")).toBe("7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr");
  });
});

describe("authErrorMessage", () => {
  it("explains the common Supabase Auth errors", () => {
    expect(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" })).toMatch(/No account has that key/);
    expect(authErrorMessage({ code: "over_request_rate_limit" })).toMatch(/Too many/);
  });

  it("falls back to the server's message", () => {
    expect(authErrorMessage({ message: "For security purposes, you can only request this after 42 seconds." })).toMatch(/42 seconds/);
    expect(authErrorMessage(null)).toBe("Something went wrong. Try again.");
  });
});
