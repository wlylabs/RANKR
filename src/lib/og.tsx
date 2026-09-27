// Shared pieces for the generated social cards (rendered by next/og, so inline styles only).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { markElements, RANKR_SHA256 } from "@/components/Logo";

export const OG_SIZE = { width: 1200, height: 630 };

export const OG = {
  bg: "#0A0A0A",
  fg: "#EDEDED",
  muted: "#A1A1A1",
  subtle: "#7A7A7A",
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

export function OgHashLine() {
  return (
    <div style={{ fontFamily: "Geist Mono", fontSize: 20, color: OG.subtle }}>
      {`sha256("rankr") = ${RANKR_SHA256.slice(0, 24)}…`}
    </div>
  );
}
