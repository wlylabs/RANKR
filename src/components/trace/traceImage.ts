// A trail as a picture to post, in two shapes. Tall (4:5, for phones): the trail as one line, a card per stop and
// the money between them. Wide (16:9): the whole tree as it's opened, the target on top. Both end on the case
// file's flags and where the money ended up. Drawn here in the browser from what's on screen, nothing to fetch. Flat fills and lines only, no gradients or glow: X and
// Telegram re-encode images as JPEG, which breaks soft shading into bands (see the call card).
import { avatarCells } from "@/lib/avatar";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import type { CaseExit, CaseFlag } from "@/lib/trace/case";
import { DANGER } from "@/lib/trace/kinds";
import { NODE_H, NODE_W, strokeFor, type Edge, type Layout, type Placed } from "@/lib/trace/tree";
import type { PathStep, PathStop } from "@/lib/trace/path";
import type { TraceFlow, TraceLabel, TraceResponse } from "@/lib/trace/types";
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

// ---- The tall card: the trail as one line, for phones.

/** 1080x1350: 4:5, as tall as X shows a picture whole in a phone's timeline. Drawn 2x. */
const TW = 1080;
const TH = 1350;
const TSCALE = 2;
const TPAD = 64;
/** Where the line of stops goes. */
const LINE = { top: 164, bottom: 1072 };

const ROLE: Record<Extract<PathStop, { type: "wallet" }>["role"], string> = {
  funded: "FUNDED BY",
  sent: "SENT BY",
  target: "TARGET",
  hop: "HOP",
  end: "END",
};

export type PathImageInput = Omit<TraceImageInput, "layout"> & { steps: PathStep[] };

const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** What moved down a connector: "436.9 SOL · $65.5K" and "6 tx · Sep 16 → Sep 24". */
function moved(f: TraceFlow): [string, string] {
  const top = f.assets[0];
  let amount = top ? `${formatAmount(top.amount)} ${top.symbol}` : "";
  if (f.usd !== null && !/^(USDC|USDT|DAI|PYUSD|USDe)$/.test(top?.symbol ?? "")) amount += ` · ${formatUsd(f.usd)}`;
  const when = day(f.first) === day(f.last) ? day(f.last) : `${day(f.first)} → ${day(f.last)}`;
  return [amount, `${f.txs} ${f.txs === 1 ? "tx" : "txs"} · ${when}`];
}

/** The trail as a tall PNG (null without a canvas): one card per stop, the money between them, the verdict. */
export async function drawPathImage(input: PathImageInput): Promise<Blob | null> {
  const { steps, root, caseId, chainName, flags, exits, where } = input;
  await document.fonts?.ready;
  const f = fonts();
  const canvas = document.createElement("canvas");
  canvas.width = TW * TSCALE;
  canvas.height = TH * TSCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(TSCALE, TSCALE);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, TW, TH);
  ctx.fillStyle = "#1c1c1c";
  for (let gx = 18; gx < TW; gx += 36) for (let gy = 18; gy < TH; gy += 36) ctx.fillRect(gx, gy, 1.6, 1.6);

  // Header: the mark and name; the case, the chain.
  mark(ctx, TPAD, 52, 46);
  ctx.font = `600 38px ${f.sans}`;
  ctx.fillStyle = C.fg;
  ctx.fillText("rankr", TPAD + 60, 89);
  ctx.textAlign = "right";
  ctx.font = `500 24px ${f.mono}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(`CASE #${caseId.toUpperCase()}`, TW - TPAD, 76);
  ctx.font = `20px ${f.mono}`;
  ctx.fillStyle = C.subtle;
  ctx.fillText(`${chainName.toUpperCase()} · FOLLOWING THE MONEY`, TW - TPAD, 104);
  ctx.textAlign = "left";

  // The stops, sized to share the room: taller cards for a short trail.
  const cards = steps.filter((s) => s.stop.type === "wallet").length;
  const gaps = steps.length - cards;
  const GAP_H = 60;
  const links = Math.max(1, steps.length - 1);
  const room = LINE.bottom - LINE.top;
  const cardH = Math.max(96, Math.min(150, (room - (steps.length - 1) * 96 - gaps * GAP_H) / Math.max(1, cards)));
  const link = Math.max(84, Math.min(170, (room - cards * cardH - gaps * GAP_H) / links));
  const total = cards * cardH + gaps * GAP_H + (steps.length - 1) * link;
  let y = LINE.top + Math.max(0, (room - total) / 2);
  const x = TPAD;
  const w = TW - 2 * TPAD;
  const g = Math.round(cardH * 0.46);
  const spine = x + 32 + g / 2;

  steps.forEach((step, i) => {
    const s = step.stop;
    const h = s.type === "gap" ? GAP_H : cardH;
    if (s.type === "gap") {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h / 2);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = C.strong;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `500 24px ${f.mono}`;
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      ctx.fillText(`⋯  ${s.count} more ${s.count === 1 ? "hop" : "hops"}  ⋯`, x + w / 2, y + h / 2 + 8);
      ctx.textAlign = "left";
    } else {
      const target = s.role === "target";
      const label = target ? root.label : s.label;
      const danger = !!label && DANGER.has(label.kind);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 22);
      ctx.fillStyle = target ? C.fg : C.surface;
      ctx.fill();
      ctx.strokeStyle = target ? C.fg : danger ? C.down : s.role === "end" ? C.strong : C.border;
      ctx.lineWidth = danger ? 3 : 2;
      ctx.stroke();
      glyph(ctx, s.address, x + 32, y + (h - g) / 2, g, target ? "#d4d4d4" : C.surface2, target ? C.bg : C.fg);
      const tx = x + 32 + g + 28;
      const max = x + w - 32 - tx;
      // The name: what a list calls it, else its address.
      ctx.font = `500 ${h >= 120 ? 42 : 36}px ${f.mono}`;
      ctx.fillStyle = target ? C.bg : danger ? C.down : C.fg;
      ctx.fillText(fit(ctx, label?.name ?? shortAddress(s.address), max), tx, y + h / 2 - 4);
      // Under it: its part in the trail, its tag, its address when it has a name.
      let lx = tx;
      const ly = y + h / 2 + 34;
      ctx.font = `500 20px ${f.mono}`;
      ctx.fillStyle = target ? "#555555" : C.subtle;
      const role = s.role === "hop" ? `HOP ${s.hop}` : ROLE[s.role];
      ctx.fillText(role, lx, ly);
      lx += ctx.measureText(role).width + 16;
      if (label) {
        lx += tag(ctx, f, label, lx, ly, 17) + 14;
        ctx.font = `20px ${f.mono}`;
        ctx.fillStyle = target ? "#555555" : C.subtle;
        ctx.fillText(fit(ctx, shortAddress(s.address), x + w - 32 - lx), lx, ly);
      } else if (target && root.balance) {
        ctx.font = `20px ${f.mono}`;
        const holds = `holds ${formatAmount(root.balance.amount)} ${root.balance.symbol}`;
        ctx.fillText(
          fit(ctx, root.balance.usd !== null ? `${holds} · ${formatUsd(root.balance.usd)}` : holds, x + w - 32 - lx),
          lx,
          ly,
        );
      }
    }
    y += h;

    // The money from this stop to the next: a line down the spine, what moved beside it.
    if (i < steps.length - 1) {
      const next = steps[i + 1].stop;
      const nextDanger = next.type === "wallet" && !!next.label && DANGER.has(next.label.kind);
      const color = nextDanger ? C.down : step.down ? "#8a8a8a" : C.strong;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash(step.down ? [] : [6, 8]);
      ctx.beginPath();
      ctx.moveTo(spine, y + 6);
      ctx.lineTo(spine, y + link - 14);
      ctx.stroke();
      ctx.setLineDash([]);
      // The arrowhead: the way the money went.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(spine - 9, y + link - 18);
      ctx.lineTo(spine + 9, y + link - 18);
      ctx.lineTo(spine, y + link - 6);
      ctx.closePath();
      ctx.fill();
      if (step.down) {
        const [amount, when] = moved(step.down);
        ctx.font = `500 28px ${f.mono}`;
        ctx.fillStyle = nextDanger ? C.down : C.fg;
        ctx.fillText(fit(ctx, amount, w - (spine - x) - 40), spine + 28, y + link / 2 + 2);
        ctx.font = `20px ${f.mono}`;
        ctx.fillStyle = C.subtle;
        ctx.fillText(fit(ctx, when, w - (spine - x) - 40), spine + 28, y + link / 2 + 30);
      }
      y += link;
    }
  });

  // The verdict: the case file's flags, where the money ended up; then the link and what a label is.
  ctx.fillStyle = C.border;
  ctx.fillRect(TPAD, 1096, TW - 2 * TPAD, 2);
  let fx = TPAD;
  let fy = 1116;
  ctx.font = `22px ${f.sans}`;
  for (const flag of flags.slice(0, 2)) {
    const text = fit(ctx, flag.text, TW - 2 * TPAD - 32);
    const fw = ctx.measureText(text).width + 32;
    if (fx + fw > TW - TPAD) {
      fx = TPAD;
      fy += 54;
    }
    if (fy > 1168) break;
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, 44, 10);
    ctx.fillStyle = flag.danger ? "#2a1213" : C.bg;
    ctx.fill();
    ctx.strokeStyle = flag.danger ? "#6e2a2a" : C.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = flag.danger ? C.down : C.muted;
    ctx.fillText(text, fx + 16, fy + 30);
    fx += fw + 12;
  }
  ctx.font = `500 20px ${f.mono}`;
  ctx.fillStyle = C.subtle;
  ctx.fillText("ENDED AT", TPAD, 1262);
  ctx.font = `26px ${f.sans}`;
  ctx.fillStyle = C.fg;
  const ended = exits.length
    ? exits
        .slice(0, 2)
        .map((e) => `${e.name} (${e.hops === 1 ? "directly" : `${e.hops} hops`})`)
        .join(" · ")
    : "Nothing reached yet on the wallets opened";
  ctx.fillText(fit(ctx, ended, TW - 2 * TPAD - 130), TPAD + 130, 1263);

  ctx.font = `20px ${f.mono}`;
  ctx.fillStyle = C.subtle;
  ctx.fillText(fit(ctx, where, TW - 2 * TPAD), TPAD, 1306);
  ctx.font = `18px ${f.sans}`;
  ctx.fillText(
    "Names from public lists, each with its source. A label isn't an identity, or proof of a crime.",
    TPAD,
    1332,
  );

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
