// The tree's camera: where it sits in its frame and how big. A point of the tree at (px, py) is drawn on
// screen at (x + px * k, y + py * k). Plain numbers in, plain numbers out; the canvas applies them.

export type View = { x: number; y: number; k: number };
export type Size = { width: number; height: number };
/** A box in the tree's own coordinates. */
export type Box = { left: number; top: number; right: number; bottom: number };

export const MIN_K = 0.25;
export const MAX_K = 1.75;
/** Room kept around what's brought into view. */
export const MARGIN = 20;
/** How much of the tree always stays on screen, however far it's dragged. */
const KEEP = 96;

export const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/** Zooms by `factor` around a point of the frame, which stays where it is (under the fingers, the cursor). */
export function zoomAt(v: View, factor: number, cx: number, cy: number): View {
  const k = clampK(v.k * factor);
  const f = k / v.k;
  return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
}

/** Parts of the frame covered by something drawn over it (the buttons, the strip along the bottom). */
export type Insets = { top: number; right: number; bottom: number; left: number };
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** The whole tree in the frame (less what covers it), centered, never bigger than life. */
export function fitView(content: Size, frame: Size, margin = MARGIN, insets: Insets = NO_INSETS): View {
  const width = frame.width - insets.left - insets.right - 2 * margin;
  const height = frame.height - insets.top - insets.bottom - 2 * margin;
  const k = clampK(Math.min(1, width / content.width, height / content.height));
  return {
    k,
    x: insets.left + margin + (width - content.width * k) / 2,
    y: insets.top + margin + (height - content.height * k) / 2,
  };
}

/**
 * Where a trail opens: on the target, at a size that shows about two and a half cards across a phone and
 * life size from a tablet up; the top of the tree at the top of the frame unless it all fits.
 */
export function startView(content: Size, frame: Size, target: { x: number; y: number }): View {
  const k = clampK(Math.min(1, frame.width / 520));
  const tall = content.height * k > frame.height - 2 * MARGIN;
  return { k, x: frame.width / 2 - target.x * k, y: tall ? MARGIN : (frame.height - content.height * k) / 2 };
}

/** Never lets the tree be dragged off: at least KEEP pixels of it stay in the frame each way. */
export function bound(v: View, content: Size, frame: Size): View {
  const w = content.width * v.k;
  const h = content.height * v.k;
  const keepX = Math.min(KEEP, w);
  const keepY = Math.min(KEEP, h);
  return {
    k: v.k,
    x: Math.min(frame.width - keepX, Math.max(keepX - w, v.x)),
    y: Math.min(frame.height - keepY, Math.max(keepY - h, v.y)),
  };
}

/**
 * Pans as little as possible to bring `box` into the frame (inset by `insets`, e.g. a panel over its bottom).
 * A box bigger than the frame lines up by the edge named in `prefer`: its top when opening rows downward, its
 * bottom when opening them upward, so the card that was tapped stays in sight.
 */
export function reveal(
  v: View,
  box: Box,
  frame: Size,
  prefer: "top" | "bottom" = "top",
  insets = { top: 0, bottom: 0 },
): View {
  const left = v.x + box.left * v.k;
  const right = v.x + box.right * v.k;
  const top = v.y + box.top * v.k;
  const bottom = v.y + box.bottom * v.k;
  const minX = MARGIN;
  const maxX = frame.width - MARGIN;
  const minY = MARGIN + insets.top;
  const maxY = frame.height - MARGIN - insets.bottom;

  let dx = 0;
  if (right - left > maxX - minX) dx = (minX + maxX) / 2 - (left + right) / 2;
  else if (left < minX) dx = minX - left;
  else if (right > maxX) dx = maxX - right;

  let dy = 0;
  if (bottom - top > maxY - minY) dy = prefer === "top" ? minY - top : maxY - bottom;
  else if (top < minY) dy = minY - top;
  else if (bottom > maxY) dy = maxY - bottom;

  return { k: v.k, x: v.x + dx, y: v.y + dy };
}
