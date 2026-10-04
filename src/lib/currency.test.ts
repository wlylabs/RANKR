import { describe, expect, it } from "vitest";
import { formatMoney, parseAmount, spendPresets } from "./currency";

const RATE = 16_400;

describe("formatMoney", () => {
  it("shows dollars with cents, short from $100K", () => {
    expect(formatMoney(1234.5, "usd", null)).toBe("$1,234.50");
    expect(formatMoney(0.42, "usd", RATE)).toBe("$0.42");
    expect(formatMoney(250_000, "usd", null)).toBe("$250K");
    expect(formatMoney(12.3, "usd", null, { signed: true })).toBe("+$12.30");
    expect(formatMoney(-12.3, "usd", null)).toBe("-$12.30");
    expect(formatMoney(0, "usd", null, { signed: true })).toBe("$0.00");
    expect(formatMoney(Number.NaN, "usd", null)).toBe("—");
  });

  it("shows rupiah the Indonesian way, short from Rp1 M", () => {
    expect(formatMoney(100, "idr", RATE)).toBe("Rp1.640.000");
    expect(formatMoney(1000, "idr", RATE)).toBe("Rp16.400.000");
    expect(formatMoney(-0.5, "idr", RATE)).toBe("-Rp8.200");
    expect(formatMoney(100_000, "idr", RATE)).toBe("Rp1,6 miliar");
    expect(formatMoney(25, "idr", RATE, { signed: true })).toBe("+Rp410.000");
  });

  it("has a short form for tight spots", () => {
    expect(formatMoney(140.43, "usd", null, { short: true })).toBe("$140");
    expect(formatMoney(1234, "usd", null, { short: true })).toBe("$1.23K");
    expect(formatMoney(0.5, "usd", null, { short: true })).toBe("$0.50");
    expect(formatMoney(151.6, "idr", 17_900, { short: true })).toBe("Rp2,7 jt");
    expect(formatMoney(41.36, "idr", 17_900, { short: true })).toBe("Rp740,3 rb");
    expect(formatMoney(-41.36, "idr", 17_900, { short: true, signed: true })).toBe("-Rp740,3 rb");
  });

  it("falls back to dollars while the rate isn't known", () => {
    expect(formatMoney(100, "idr", null)).toBe("$100.00");
  });
});

describe("spendPresets", () => {
  it("offers $100-$1,000 in dollars", () => {
    expect(spendPresets("usd", RATE).map((p) => p.usd)).toEqual([100, 250, 500, 1000]);
  });

  it("offers round rupiah amounts that fit $100-$1,000 at the day's rate", () => {
    const idr = spendPresets("idr", RATE);
    expect(idr.map((p) => p.label)).toEqual(["Rp2 jt", "Rp5 jt", "Rp10 jt", "Rp15 jt"]);
    expect(idr[0].usd).toBeCloseTo(2_000_000 / RATE, 9);
    // A rupiah far stronger than today: only Rp2 jt still fits, so dollars it is.
    expect(spendPresets("idr", 1_000).map((p) => p.usd)).toEqual([100, 250, 500, 1000]);
  });
});

describe("parseAmount", () => {
  it("reads rupiah with dots for thousands and dollars with commas", () => {
    expect(parseAmount("1.500.000", "idr", RATE)).toBeCloseTo(1_500_000 / RATE, 9);
    expect(parseAmount("Rp 2.500.000,50", "idr", RATE)).toBeCloseTo(2_500_000.5 / RATE, 9);
    expect(parseAmount("1,250", "usd", RATE)).toBe(1250);
    expect(parseAmount("$250.5", "usd", null)).toBe(250.5);
    expect(parseAmount("", "usd", null)).toBeNull();
    expect(parseAmount("abc", "idr", RATE)).toBeNull();
    expect(parseAmount("0", "usd", null)).toBeNull();
  });
});
