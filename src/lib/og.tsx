// Shared pieces for the generated social cards (rendered by next/og, so inline styles only).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { markElements } from "@/components/Logo";
import { avatarCells } from "./avatar";

export const OG_SIZE = { width: 1200, height: 630 };

export const OG = {
  bg: "#0A0A0A",
  fg: "#EDEDED",
  muted: "#A1A1A1",
  subtle: "#7A7A7A",
  surface2: "#171717",
  border: "#232323",
  up: "#3FB950",
  down: "#F85149",
};

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: "normal" };

const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Geist + Geist Mono from the installed font package; falls back to the built-in font if unreadable. */
export async function ogFonts(): Promise<OgFont[] | undefined> {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules/geist/dist/fonts");
  try {
    const [sans, sansSemi, mono] = await Promise.all([
      readFile(path.join(dir, "geist-sans/Geist-Regular.ttf")),
      readFile(path.join(dir, "geist-sans/Geist-SemiBold.ttf")),
      readFile(path.join(dir, "geist-mono/GeistMono-Medium.ttf")),
    ]);
    return [
      { name: "Geist", data: buf(sans), weight: 400, style: "normal" },
      { name: "Geist", data: buf(sansSemi), weight: 600, style: "normal" },
      { name: "Geist Mono", data: buf(mono), weight: 500, style: "normal" },
    ];
  } catch {
    return undefined;
  }
}

export function OgLogo({ size = 44 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.35 }}>
      <svg width={size} height={size} viewBox="0 0 64 64">
        <rect width="64" height="64" rx="14" fill={OG.fg} />
        {markElements(OG.bg, OG.bg, 0.5)}
      </svg>
      <div style={{ fontSize: size * 0.8, fontWeight: 600, letterSpacing: "-0.04em", color: OG.fg }}>rankr</div>
    </div>
  );
}

/** A caller's matrix avatar (see Avatar.tsx), as plain SVG. `tile`: the rounded square behind it. */
export function OgAvatar({ userId, size, color = OG.fg, tile = OG.surface2 }: { userId: string; size: number; color?: string; tile?: string }) {
  const pad = 12;
  const cell = (64 - 2 * pad) / 5;
  const gap = 1.6;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill={tile} />
      {avatarCells(userId).map(([c, r]) => (
        <rect
          key={`${c}${r}`}
          x={pad + c * cell + gap / 2}
          y={pad + r * cell + gap / 2}
          width={cell - gap}
          height={cell - gap}
          rx={cell * 0.2}
          fill={color}
        />
      ))}
    </svg>
  );
}

/** The official account's check badge (see OfficialBadge.tsx). */
export function OgCheck({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill={OG.fg}
      />
      <path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke={OG.bg} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
