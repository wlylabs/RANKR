// A trail as a picture to post: the path as followed on screen, 4:5 for phones, a card per stop and the money
// between them, ending on the case file's flags and where the money ended up. Drawn here in the browser from
// what's on screen, nothing to fetch. Flat fills and lines only, no gradients or glow: X and Telegram re-encode
// images as JPEG, which breaks soft shading into bands (see the call card).
import { avatarCells } from "@/lib/avatar";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import type { CaseExit, CaseFlag } from "@/lib/trace/case";
import { DANGER } from "@/lib/trace/kinds";
import type { PathStep, PathStop } from "@/lib/trace/path";
import type { TraceFlow, TraceLabel, TraceResponse } from "@/lib/trace/types";
import { markCells } from "../Logo";

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

export type PathImageInput = TraceImageInput & { steps: PathStep[] };

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
