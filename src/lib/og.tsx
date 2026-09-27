// Shared pieces for the generated social cards (rendered by next/og, so inline styles only).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BRAND } from "@/components/Logo";

export const OG_SIZE = { width: 1200, height: 630 };

export const OG = {
  bg: "#0A0A0A",
  fg: "#EDEDED",
  muted: "#8A8A8A",
  border: "#242424",
  up: "#3DDC84",
  down: "#FF4D6A",
  orange: BRAND.orange,
};

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 700; style: "normal" };

const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Geist + Geist Mono + Geist Pixel; falls back to the built-in font if the files can't be read. */
export async function ogFonts(): Promise<OgFont[] | undefined> {
  const root = /*turbopackIgnore: true*/ process.cwd();
  const geist = path.join(root, "node_modules/geist/dist/fonts");
  try {
    const [sans, mono, pixel] = await Promise.all([
      readFile(path.join(geist, "geist-sans/Geist-Regular.ttf")),
      readFile(path.join(geist, "geist-mono/GeistMono-Medium.ttf")),
      readFile(path.join(root, "src/assets/fonts/GeistPixel-Square.ttf")),
    ]);
    return [
      { name: "Geist", data: buf(sans), weight: 400, style: "normal" },
      { name: "Geist Mono", data: buf(mono), weight: 500, style: "normal" },
      { name: "Pixel", data: buf(pixel), weight: 400, style: "normal" },
    ];
  } catch {
    return undefined;
  }
}

export function OgLogo({ size = 56 }: { size?: number }) {
  const wordHeight = size * 0.62;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.36 }}>
      <svg width={size} height={size} viewBox="0 0 64 64">
        <rect width="64" height="64" rx="12" fill={BRAND.orange} />
        <path d={BRAND.markPath} fill={BRAND.ink} />
      </svg>
      <svg height={wordHeight} width={(wordHeight * 247) / 72.2} viewBox={BRAND.wordmarkViewBox}>
        <path d={BRAND.wordmarkPath} fill={OG.fg} />
      </svg>
    </div>
  );
}

/** Dot-matrix backdrop matching the site hero. */
export const ogBackground = {
  backgroundColor: OG.bg,
  backgroundImage: "radial-gradient(circle, rgba(237,237,237,0.07) 1.5px, transparent 1.5px)",
  backgroundSize: "24px 24px",
};
