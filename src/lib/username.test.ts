import { describe, expect, it } from "vitest";
import { checkUsername } from "./username";

describe("checkUsername", () => {
  it("accepts 3-20 letters, numbers and underscores", () => {
    expect(checkUsername("degen_42")).toBeNull();
    expect(checkUsername("abc")).toBeNull();
    expect(checkUsername("a".repeat(20))).toBeNull();
  });
  it("rejects bad formats and reserved names", () => {
    expect(checkUsername("ab")).toBe("invalid");
    expect(checkUsername("a".repeat(21))).toBe("invalid");
    expect(checkUsername("bad name")).toBe("invalid");
    expect(checkUsername("ünï")).toBe("invalid");
    expect(checkUsername("Admin")).toBe("reserved");
  });
  it("reserves look-alikes of the project, like the SQL rules", () => {
    for (const name of ["rankr", "Rankr_Team", "RANKRbot", "the_official", "OfficialCaller"]) {
      expect(checkUsername(name), name).toBe("reserved");
    }
    expect(checkUsername("ranker")).toBeNull();
    expect(checkUsername("my_rankr")).toBeNull();
  });
});
