// A trail as a picture to post: the tree as it's opened right now, the target on top, the case file's flags and
// where the money ended up along the bottom. 16:9, the shape X shows uncropped in the timeline. Drawn here in
// the browser from what's on screen, nothing to fetch. Flat fills and lines only, no gradients or glow: X and
// Telegram re-encode images as JPEG, which breaks soft shading into bands (see the call card).
import { avatarCells } from "@/lib/avatar";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import type { CaseExit, CaseFlag } from "@/lib/trace/case";
import { DANGER } from "@/lib/trace/kinds";
import { NODE_H, NODE_W, strokeFor, type Edge, type Layout, type Placed } from "@/lib/trace/tree";
import type { TraceLabel, TraceResponse } from "@/lib/trace/types";
import { markCells } from "../Logo";

/** Laid out at 1200x675 and drawn 3x: 3600x2025, sharp wherever it's shown or saved. */
const W = 1200;
const H = 675;
const SCALE = 3;
const PAD = 40;
/** Where the tree goes. */
const TREE = { left: PAD, top: 132, width: W - 2 * PAD, height: 384 };
/** Below this zoom a card shows its compact face, as on screen. */
const COMPACT = 0.6;

// The dark theme's colors (globals.css), flat.
const C = {
  bg: "#0a0a0a",
  surface: "#111111",
  surface2: "#1a1a1a",
  border: "#262626",
  strong: "#3d3d3d",
  fg: "#ededed",
  muted: "#a1a1a1",
  subtle: "#7a7a7a",
  down: "#f85149",
};

const KIND: Record<TraceLabel["kind"], string> = {
  cex: "CEX",
  bridge: "BRIDGE",
  mixer: "MIXER",
  dex: "DEX",
  contract: "CONTRACT",
  sanctioned: "OFAC",
  hack: "EXPLOIT",
  scam: "SCAM",
  frozen: "FROZEN",
  named: "NAME",
};

export type TraceImageInput = {
  layout: Layout;
  root: TraceResponse;
  caseId: string;
  chainName: string;
  flags: CaseFlag[];
  exits: CaseExit[];
  /** Where the trail lives, shown in the corner: "rankr.app/trace/solana/GBER…mTgu". */
  where: string;
};

type Fonts = { sans: string; mono: string };

function fonts(): Fonts {
  const css = getComputedStyle(document.documentElement);
  return {
    sans: css.getPropertyValue("--font-geist-sans").trim() || "ui-sans-serif, system-ui, sans-serif",
    mono: css.getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace",
  };
}

/** `text` cut with an ellipsis to fit `max` px in the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function glyph(
  ctx: CanvasRenderingContext2D,
  seed: string,
  x: number,
  y: number,
  size: number,
  tile: string,
  ink: string,
) {
  ctx.fillStyle = tile;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.24);
  ctx.fill();
  const pad = size * 0.19;
  const cell = (size - 2 * pad) / 5;
  ctx.fillStyle = ink;
  for (const [c, r] of avatarCells(seed)) {
    ctx.beginPath();
    ctx.roundRect(
      x + pad + c * cell + cell * 0.08,
      y + pad + r * cell + cell * 0.08,
      cell * 0.84,
      cell * 0.84,
      cell * 0.2,
    );
    ctx.fill();
  }
}

/** The Rankr mark: the solid tile with the matrix knocked out (LogoMark). */
function mark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const u = size / 64;
  ctx.fillStyle = C.fg;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 14 * u);
  ctx.fill();
  const pad = 10 * u;
  const cell = (size - 2 * pad) / 5;
  const { letter, hash } = markCells();
  ctx.fillStyle = C.bg;
  for (const [c, r] of letter) {
    ctx.beginPath();
    ctx.roundRect(
      x + pad + c * cell + 0.8 * u,
      y + pad + r * cell + 0.8 * u,
      cell - 1.6 * u,
      cell - 1.6 * u,
      cell * 0.2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 0.5;
  for (const [c, r] of hash) {
    ctx.beginPath();
    ctx.arc(x + pad + c * cell + cell / 2, y + pad + r * cell + cell / 2, cell * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A label's tag: filled for an exchange, red for trouble, outlined otherwise. Returns its width. */
function tag(ctx: CanvasRenderingContext2D, f: Fonts, label: TraceLabel, x: number, y: number, size: number): number {
  const danger = DANGER.has(label.kind);
  ctx.font = `500 ${size}px ${f.mono}`;
  const text = KIND[label.kind];
  const w = ctx.measureText(text).width + size * 0.8;
  const h = size * 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y - h * 0.72, w, h, size * 0.3);
  if (danger || label.kind === "cex") {
    ctx.fillStyle = danger ? C.down : C.fg;
    ctx.fill();
    ctx.fillStyle = C.bg;
  } else {
    ctx.strokeStyle = C.strong;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.muted;
  }
  ctx.fillText(text, x + size * 0.4, y);
  return w;
}

function edgePath(ctx: CanvasRenderingContext2D, e: Edge, k: number, ox: number, oy: number) {
  const x1 = ox + e.x1 * k;
  const y1 = oy + e.y1 * k;
  const x2 = ox + e.x2 * k;
  const y2 = oy + e.y2 * k;
  const my = (y2 - y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1, y1 + my, x2, y2 - my, x2, y2);
}

function cardFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  dashed = false,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(8, h * 0.2));
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.setLineDash(dashed ? [4, 3] : []);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

/** One card, at life size times `k`: its full face, or its compact one when that's too small to read. */
function card(
  ctx: CanvasRenderingContext2D,
  f: Fonts,
  n: Placed,
  root: TraceResponse,
  k: number,
  ox: number,
  oy: number,
) {
  const { item } = n;
  const w = NODE_W * k;
  const h = NODE_H * k;
  const x = ox + n.x * k - w / 2;
  const y = oy + n.y * k - h / 2;
  const isRoot = item.type === "root";
  const label = isRoot ? root.label : (item.flow?.label ?? null);
  const danger = !!label && DANGER.has(label.kind);
  const compact = k < COMPACT;
  const ink = isRoot ? C.bg : C.fg;
  const dim = isRoot ? "#4a4a4a" : C.muted;

  if (item.type === "root") cardFrame(ctx, x, y, w, h, C.fg, C.fg);
  else if (item.type === "wallet")
    cardFrame(ctx, x, y, w, h, C.surface, danger ? C.down : item.flow?.terminal ? C.strong : C.border, !!item.loop);
  else cardFrame(ctx, x, y, w, h, C.bg, item.type === "error" ? C.down : C.border, true);

  // Small cards (and the cards that aren't wallets) say one thing, centered.
  const one = (text: string, color: string) => {
    ctx.font = `500 ${compact ? 11 : 13 * k}px ${f.mono}`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(fit(ctx, text, w - 8), x + w / 2, y + h / 2 + (compact ? 4 : 4.5 * k));
    ctx.textAlign = "left";
  };
  if (item.type === "swaps") return one(`⇄ ${item.swaps!.txs} trades`, C.muted);
  if (item.type === "more") return one(`+${item.count} more`, C.muted);
  if (item.type === "others") return one(`+${item.count} others`, C.muted);
  if (item.type === "pending") return one("reading…", C.subtle);
  if (item.type === "error") return one("couldn't read", C.down);

  const name = label?.name ?? shortAddress(item.address!);
  if (compact) {
    const g = 12;
    glyph(ctx, item.address!, x + 5, y + h / 2 - g / 2, g, isRoot ? "#d4d4d4" : C.surface2, ink);
    ctx.font = `500 11px ${f.mono}`;
    ctx.fillStyle = danger ? C.down : ink;
    ctx.fillText(fit(ctx, label?.name ?? item.address!.slice(0, 4) + "…", w - g - 14), x + g + 9, y + h / 2 + 4);
    return;
  }

  // The full face, as on screen, scaled by k.
  const p = 12 * k;
  glyph(ctx, item.address!, x + p, y + 11 * k, 20 * k, isRoot ? "#d4d4d4" : C.surface2, ink);
  ctx.font = `500 ${12.5 * k}px ${f.mono}`;
  ctx.fillStyle = ink;
  ctx.fillText(fit(ctx, shortAddress(item.address!), w - 40 * k - p), x + 40 * k, y + 25.5 * k);
  if (item.funder) {
    ctx.font = `500 ${8.5 * k}px ${f.mono}`;
    ctx.fillStyle = C.muted;
    ctx.fillText("1ST", x + w - p - 18 * k, y + 25 * k);
  }
  let lx = x + p;
  const ly = y + 45 * k;
  if (label) {
    lx += tag(ctx, f, label, lx, ly, 9.5 * k) + 6 * k;
    ctx.font = `${12 * k}px ${f.sans}`;
    ctx.fillStyle = danger ? C.down : dim;
    ctx.fillText(fit(ctx, label.name, x + w - p - lx), lx, ly);
  } else {
    ctx.font = `${11 * k}px ${f.mono}`;
    ctx.fillStyle = isRoot ? "#555" : C.subtle;
    ctx.fillText(isRoot ? "Target · holds" : item.loop ? "↺ already on this trail" : "Wallet", lx, ly);
  }
  ctx.font = `${11 * k}px ${f.mono}`;
  ctx.fillStyle = dim;
  let line = "";
  if (isRoot) {
    if (root.balance) {
      line = `${formatAmount(root.balance.amount)} ${root.balance.symbol}`;
      if (root.balance.usd !== null) line += ` · ${formatUsd(root.balance.usd)}`;
    }
  } else if (item.flow) {
    const top = item.flow.assets[0];
    line = top ? `${formatAmount(top.amount)} ${top.symbol}` : "";
    if (item.flow.usd !== null && !/^(USDC|USDT|DAI|PYUSD|USDe)$/.test(top?.symbol ?? ""))
      line += ` · ${formatUsd(item.flow.usd)}`;
    if (item.flow.txs > 1) line += ` ×${item.flow.txs}`;
  }
  ctx.fillText(fit(ctx, line, w - 2 * p), x + p, y + 64 * k);
  // Where the trail stops: a tab under the card.
  if (item.flow?.terminal && item.side === "out") {
    ctx.font = `500 ${8 * k}px ${f.mono}`;
    const tw = ctx.measureText("END").width + 8 * k;
    ctx.beginPath();
    ctx.roundRect(x + w / 2 - tw / 2, y + h - 1, tw, 12 * k, 2 * k);
    ctx.fillStyle = C.bg;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.stroke();
    ctx.fillStyle = C.subtle;
    ctx.textAlign = "center";
    ctx.fillText("END", x + w / 2, y + h - 1 + 9 * k);
    ctx.textAlign = "left";
  }
}

const TONES: Record<Edge["tone"], string> = { plain: "#5a5a5a", end: C.muted, danger: C.down, faint: C.border };

/** The trail as a PNG (null without a canvas). */
export async function drawTraceImage(input: TraceImageInput): Promise<Blob | null> {
  const { layout, root, caseId, chainName, flags, exits, where } = input;
  await document.fonts?.ready;
  const f = fonts();
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // The dotted ledger, sparse: dense dots turn to mush in a JPEG.
  ctx.fillStyle = "#1c1c1c";
  for (let gx = 12; gx < W; gx += 24) for (let gy = 12; gy < H; gy += 24) ctx.fillRect(gx, gy, 1.2, 1.2);

  // Header: the mark and name, the case.
  mark(ctx, PAD, 30, 26);
  ctx.font = `600 21px ${f.sans}`;
  ctx.fillStyle = C.fg;
  ctx.fillText("rankr", PAD + 34, 50);
  ctx.font = `500 12px ${f.mono}`;
  ctx.fillStyle = C.subtle;
  ctx.textAlign = "right";
  ctx.fillText(`TRACE · CASE #${caseId.toUpperCase()} · ${chainName.toUpperCase()}`, W - PAD, 48);
  ctx.textAlign = "left";

  const name = root.label?.name ?? shortAddress(root.address);
  ctx.font = `600 32px ${f.mono}`;
  ctx.fillStyle = C.fg;
  ctx.fillText(fit(ctx, name, 640), PAD, 104);
  const nameWidth = Math.min(640, ctx.measureText(name).width);
  ctx.font = `14px ${f.mono}`;
  ctx.fillStyle = C.muted;
  ctx.fillText("↓ money flows down", PAD + nameWidth + 18, 103);

  // The tree, fitted to its area (never past life size), centered.
  const k = Math.min(1, TREE.width / layout.width, TREE.height / layout.height);
  const ox = TREE.left + (TREE.width - layout.width * k) / 2;
  const oy = TREE.top + (TREE.height - layout.height * k) / 2;
  ctx.lineCap = "round";
  for (const e of layout.edges) {
    edgePath(ctx, e, k, ox, oy);
    ctx.strokeStyle = TONES[e.tone];
    ctx.lineWidth = Math.max(1, strokeFor(e.usd) * Math.max(k, 0.7));
    ctx.setLineDash(e.tone === "faint" ? [3, 4] : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const n of layout.nodes) card(ctx, f, n, root, k, ox, oy);

  // What the case file says: its flags, then where the money ended up.
  ctx.fillStyle = C.border;
  ctx.fillRect(PAD, 536, W - 2 * PAD, 1);
  let fx = PAD;
  ctx.font = `13px ${f.sans}`;
  for (const flag of flags.slice(0, 3)) {
    const text = fit(ctx, flag.text, 360);
    const w = ctx.measureText(text).width + 22;
    if (fx + w > W - PAD) break;
    ctx.beginPath();
    ctx.roundRect(fx, 552, w, 28, 6);
    ctx.fillStyle = flag.danger ? "#2a1213" : C.bg;
    ctx.fill();
    ctx.strokeStyle = flag.danger ? "#6e2a2a" : C.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = flag.danger ? C.down : C.muted;
    ctx.fillText(text, fx + 11, 571);
    fx += w + 8;
  }
  ctx.font = `500 12px ${f.mono}`;
  ctx.fillStyle = C.subtle;
  ctx.fillText("ENDED AT", PAD, 614);
  ctx.font = `14px ${f.sans}`;
  ctx.fillStyle = C.fg;
  const ended = exits.length
    ? exits
        .slice(0, 3)
        .map(
          (e) =>
            `${e.name} (${e.hops === 1 ? "directly" : `${e.hops} hops`}${e.usd !== null ? `, ${formatUsd(e.usd)}` : ""})`,
        )
        .join("   ·   ")
    : "No exchange, bridge or mixer on the wallets opened so far";
  ctx.fillText(fit(ctx, ended, W - 2 * PAD - 92), PAD + 92, 614);

  // Footer: where it lives, and what a label is.
  ctx.font = `12px ${f.mono}`;
  ctx.fillStyle = C.subtle;
  ctx.fillText(fit(ctx, where, 520), PAD, H - 26);
  ctx.font = `12px ${f.sans}`;
  ctx.textAlign = "right";
  ctx.fillText(
    "Names from public lists, each with its source. A label isn't an identity, or proof of a crime.",
    W - PAD,
    H - 26,
  );
  ctx.textAlign = "left";

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
