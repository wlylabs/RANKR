import { describe, expect, it } from "vitest";
import { dayLabel, formatChange, formatCount, formatMultiple, formatPrice, formatUsd, timeAgo } from "./format";

describe("formatMultiple", () => {
  it("shows gains as x and losses as %", () => {
    expect(formatMultiple(2)).toBe("2.00x");
    expect(formatMultiple(3.456)).toBe("3.46x");
    expect(formatMultiple(12.34)).toBe("12.3x");
    expect(formatMultiple(250.4)).toBe("250x");
    expect(formatMultiple(1234)).toBe("1,234x");
    expect(formatMultiple(0.5)).toBe("-50.0%");
    expect(formatMultiple(0.08)).toBe("-92.0%");
  });
});

describe("formatChange", () => {
  it("signs the percentage", () => {
    expect(formatChange(1.5)).toBe("+50.0%");
    expect(formatChange(3)).toBe("+200%");
    expect(formatChange(0.25)).toBe("-75.0%");
  });
});

describe("formatCount", () => {
  it("shortens a count", () => {
    expect([500, 2_000, 2_500, 200_000, 1_000_000].map(formatCount)).toEqual(["500", "2K", "2.5K", "200K", "1M"]);
  });
});

describe("formatUsd", () => {
  it("compacts market caps", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(821.24)).toBe("$821");
    expect(formatUsd(4_600)).toBe("$4.60K");
    expect(formatUsd(51_100)).toBe("$51.1K");
    expect(formatUsd(141_000)).toBe("$141K");
    expect(formatUsd(2_500_000)).toBe("$2.50M");
    expect(formatUsd(1_200_000_000)).toBe("$1.20B");
  });
});

describe("formatPrice", () => {
  it("compresses leading zeros like DexScreener", () => {
    expect(formatPrice(0.00001234)).toBe("$0.0₄1234");
    expect(formatPrice(0.000000000512)).toBe("$0.0₉512");
    expect(formatPrice(0.0123)).toBe("$0.0123");
    expect(formatPrice(1.5)).toBe("$1.5");
    expect(formatPrice(0)).toBe("—");
  });
});

describe("timeAgo", () => {
  it("rounds to the largest unit", () => {
    const now = 1_000_000_000_000;
    expect(timeAgo(now - 10_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2d ago");
    expect(timeAgo(now - 10_000, now, true)).toBe("now");
    expect(timeAgo(now - 5 * 60_000, now, true)).toBe("5m");
  });
});

describe("dayLabel", () => {
  // Local times, like the labels.
  const now = new Date(2026, 8, 28, 10, 30).getTime();

  it("names today and yesterday by calendar day, not 24 hours", () => {
    expect(dayLabel(new Date(2026, 8, 28, 0, 1).getTime(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 8, 27, 23, 59).getTime(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 8, 27, 0, 0).getTime(), now)).toBe("Yesterday");
    expect(dayLabel(now + 60_000, now)).toBe("Today"); // a clock slightly ahead
  });

  it("dates older days, with the year only when it isn't this one", () => {
    expect(dayLabel(new Date(2026, 8, 25, 12).getTime(), now)).toBe("Sep 25");
    expect(dayLabel(new Date(2025, 11, 31, 12).getTime(), now)).toBe("Dec 31, 2025");
  });
});
