import { describe, expect, it } from "vitest";
import { milestoneAlerts, type AlertItem } from "./alerts";

const item = (multiple: number, key = "call:solana:A"): AlertItem => ({ key, symbol: "A", multiple, href: "/t/solana/A", kind: "call" });

describe("milestoneAlerts", () => {
  it("only records where a token stands the first time it is seen", () => {
    const out = milestoneAlerts([item(6.2)], {});
    expect(out.alerts).toEqual([]);
    expect(out.seen).toEqual({ "call:solana:A": 5 });
  });

  it("alerts once per new milestone, with the highest one reached", () => {
    let seen: Record<string, number> = { "call:solana:A": 0 };
    const first = milestoneAlerts([item(3.4)], seen);
    expect(first.alerts.map((a) => a.milestone)).toEqual([3]);
    seen = first.seen;
    expect(milestoneAlerts([item(3.9)], seen).alerts).toEqual([]); // still 3x
    expect(milestoneAlerts([item(12)], seen).alerts.map((a) => a.milestone)).toEqual([10]);
  });

  it("does not alert again after a dip back through the same milestone", () => {
    const seen = { "call:solana:A": 2 };
    expect(milestoneAlerts([item(1.4)], seen).alerts).toEqual([]);
    expect(milestoneAlerts([item(2.1)], seen).alerts).toEqual([]);
  });
});
