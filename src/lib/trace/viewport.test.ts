import { describe, expect, it } from "vitest";
import { bound, fitView, MAX_K, MIN_K, reveal, startView, zoomAt } from "./viewport";

const phone = { width: 360, height: 520 };

describe("viewport", () => {
  it("zooms around the point under the fingers, within limits", () => {
    const v = zoomAt({ x: 0, y: 0, k: 1 }, 1.5, 100, 50);
    expect(v).toEqual({ k: 1.5, x: -50, y: -25 });
    // The tree point that was under (100, 50) still is.
    expect((100 - v.x) / v.k).toBe(100);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 100, 0, 0).k).toBe(MAX_K);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 0.001, 0, 0).k).toBe(MIN_K);
  });

  it("fits the whole tree, centered, never past life size", () => {
    const v = fitView({ width: 1200, height: 600 }, phone);
    expect(v.k).toBeCloseTo((360 - 40) / 1200);
    expect(v.x + (1200 * v.k) / 2).toBeCloseTo(180);
    expect(fitView({ width: 100, height: 100 }, phone).k).toBe(1);
  });

  it("fits in what the buttons and the bottom strip leave free", () => {
    const v = fitView({ width: 1000, height: 400 }, phone, 20, { top: 0, right: 56, bottom: 80, left: 0 });
    expect(v.k).toBeCloseTo((360 - 56 - 40) / 1000);
    // Centered between the left edge and the buttons, and above the strip.
    expect(v.x + (1000 * v.k) / 2).toBeCloseTo((360 - 56) / 2);
    expect(v.y + (400 * v.k) / 2).toBeCloseTo((520 - 80) / 2);
  });

  it("opens on the target, about two and a half cards across a phone", () => {
    const v = startView({ width: 1200, height: 420 }, phone, { x: 600, y: 210 });
    expect(v.k).toBeCloseTo(360 / 520);
    expect(v.x + 600 * v.k).toBeCloseTo(180);
    expect(startView({ width: 1200, height: 420 }, { width: 1100, height: 700 }, { x: 600, y: 210 }).k).toBe(1);
  });

  it("keeps part of the tree on screen however far it's dragged", () => {
    const content = { width: 1000, height: 400 };
    expect(bound({ x: -5000, y: 9000, k: 1 }, content, phone)).toEqual({ k: 1, x: 96 - 1000, y: 520 - 96 });
    expect(bound({ x: 10, y: 10, k: 1 }, content, phone)).toEqual({ k: 1, x: 10, y: 10 });
  });

  it("pans just enough to show what was opened, keeping the tapped card in sight when it can't all fit", () => {
    const v = { x: 0, y: 0, k: 1 };
    expect(reveal(v, { left: 10, top: 100, right: 200, bottom: 600 }, phone, "top")).toEqual({ k: 1, x: 10, y: -80 });
    // Too tall: opening downward, its top (the tapped card) lines up with the top of the frame.
    expect(reveal(v, { left: 10, top: 300, right: 200, bottom: 1300 }, phone, "top").y).toBe(20 - 300);
    // A panel over the bottom of the frame counts as off screen.
    expect(reveal(v, { left: 20, top: 400, right: 200, bottom: 480 }, phone, "top", { top: 0, bottom: 80 }).y).toBe(
      520 - 20 - 80 - 480,
    );
  });
});
