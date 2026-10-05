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
  it("offers round dollar amounts", () => {
    expect(spendPresets("usd", RATE).map((p) => p.label)).toEqual(["$50", "$100", "$500", "$1,000"]);
  });

  it("offers round rupiah amounts, in dollars at the day's rate", () => {
    const idr = spendPresets("idr", RATE);
    expect(idr.map((p) => p.label)).toEqual(["Rp500 rb", "Rp1 jt", "Rp5 jt", "Rp10 jt"]);
    expect(idr[1].usd).toBeCloseTo(1_000_000 / RATE, 9);
    // No rate yet: dollars.
    expect(spendPresets("idr", null).map((p) => p.usd)).toEqual([50, 100, 500, 1000]);
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

  it("reads the short ways amounts are written", () => {
    const idr = (s: string) => parseAmount(s, "idr", RATE)! * RATE;
    expect(idr("2,5 jt")).toBeCloseTo(2_500_000, 3);
    expect(idr("1.5jt")).toBeCloseTo(1_500_000, 3);
    expect(idr("Rp500rb")).toBeCloseTo(500_000, 3);
    expect(idr("750 ribu")).toBeCloseTo(750_000, 3);
    expect(idr("2 juta")).toBeCloseTo(2_000_000, 3);
    expect(idr("1M")).toBeCloseTo(1e9, 3); // a miliar, as Indonesians write it
    expect(idr("1,2 miliar")).toBeCloseTo(1.2e9, 3);
    expect(idr("1.500")).toBeCloseTo(1500, 6);
    expect(parseAmount("10k", "usd", null)).toBe(10_000);
    expect(parseAmount("$1.5m", "usd", null)).toBe(1_500_000); // a million, in dollars
    expect(parseAmount("2.5K", "usd", null)).toBe(2_500);
    expect(parseAmount("1,234.5", "usd", null)).toBe(1234.5);
    expect(parseAmount("1.234,5", "usd", null)).toBe(1234.5);
    expect(parseAmount("2,5", "usd", null)).toBe(2.5);
    expect(parseAmount("10 apples", "usd", null)).toBeNull();
    expect(parseAmount("-5", "usd", null)).toBeNull();
  });
});

describe("formatMoney edges", () => {
  it("puts no sign on what rounds to nothing", () => {
    expect(formatMoney(-0.001, "usd", null)).toBe("$0.00");
    expect(formatMoney(0.001, "usd", null, { signed: true })).toBe("$0.00");
    expect(formatMoney(-0.00001, "idr", RATE)).toBe("Rp0");
  });

  it("writes out a miliar rather than round up to \"1 M\"", () => {
    expect(formatMoney(999_960_000 / RATE, "idr", RATE, { short: true })).toBe("Rp1 miliar");
    expect(formatMoney(999_000_000 / RATE, "idr", RATE, { short: true })).toBe("Rp999 jt");
  });
});
