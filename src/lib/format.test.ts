import { describe, expect, it } from "vitest";
import { formatChange, formatMove, formatMultiple, formatPrice, formatUsd, timeAgo } from "./format";

describe("formatMultiple (1x = +100%)", () => {
  it("shows a fresh paste as 0%, not 1x", () => {
    expect(formatMultiple(1)).toBe("0.0%");
    expect(formatMultiple(1.0001)).toBe("0.0%");
  });

  it("uses percentages below +100%", () => {
    expect(formatMultiple(1.5)).toBe("+50.0%");
    expect(formatMultiple(1.999)).toBe("+99.9%");
    expect(formatMultiple(0.5)).toBe("-50.0%");
    expect(formatMultiple(0.08)).toBe("-92.0%");
  });

  it("counts x as gain from +100% up", () => {
    expect(formatMultiple(2)).toBe("1.00x"); // doubled
    expect(formatMultiple(2.45)).toBe("1.45x");
    expect(formatMultiple(3)).toBe("2.00x");
    expect(formatMultiple(11)).toBe("10.0x");
    expect(formatMultiple(251)).toBe("250x");
    expect(formatMultiple(1235)).toBe("1,234x");
  });

  it("formats sentences with both", () => {
    expect(formatMove(2.45)).toBe("1.45x (+145%)");
    expect(formatMove(1.3)).toBe("+30.0%");
  });
});

describe("formatChange", () => {
  it("signs the percentage", () => {
    expect(formatChange(1.5)).toBe("+50.0%");
    expect(formatChange(3)).toBe("+200%");
    expect(formatChange(0.25)).toBe("-75.0%");
    expect(formatChange(1)).toBe("0.0%");
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
  });
});
