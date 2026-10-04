import { describe, expect, it } from "vitest";
import { monthLabel, nextResetAt, resetDay, untilLabel } from "./reset";

describe("monthly reset", () => {
  it("resets at 00:00 UTC on the 1st of the coming month", () => {
    expect(nextResetAt(Date.parse("2026-09-27T15:49:00Z"))).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(nextResetAt(Date.parse("2026-12-31T23:59:59Z"))).toBe(Date.parse("2027-01-01T00:00:00Z"));
    // Right at the reset, the next one is a month away.
    expect(nextResetAt(Date.parse("2026-10-01T00:00:00Z"))).toBe(Date.parse("2026-11-01T00:00:00Z"));
    expect(resetDay(Date.parse("2026-10-01T00:00:00Z"))).toBe("Oct 1");
  });

  it("says how long until the reset", () => {
    const at = Date.parse("2026-10-01T00:00:00Z");
    expect(untilLabel(at, at - 3 * 86_400_000 - 4 * 3_600_000)).toBe("3d 4h");
    expect(untilLabel(at, at - 2 * 86_400_000)).toBe("2d");
    expect(untilLabel(at, at - 5 * 3_600_000 - 60_000)).toBe("5h");
    expect(untilLabel(at, at - 12 * 60_000)).toBe("12m");
    expect(untilLabel(at, at + 5_000)).toBe("1m");
  });

  it("names the month", () => {
    expect(monthLabel("2026-09-01")).toBe("September 2026");
    expect(monthLabel("2026-12-01T00:00:00+00:00")).toBe("December 2026");
  });
});
