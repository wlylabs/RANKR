// Shared pieces for the generated social cards (rendered by next/og, so inline styles only).
import { readFile } from "node:fs/promises";
import path from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

/** Geist from the installed font package; falls back to the built-in font if it can't be read. */
export async function ogFonts(): Promise<OgFont[] | undefined> {
  const dir = path.join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans");
  try {
    const [regular, bold] = await Promise.all([
      readFile(path.join(dir, "Geist-Regular.ttf")),
      readFile(path.join(dir, "Geist-Bold.ttf")),
    ]);
    const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    return [
      { name: "Geist", data: buf(regular), weight: 400, style: "normal" },
      { name: "Geist", data: buf(bold), weight: 700, style: "normal" },
    ];
  } catch {
    return undefined;
  }
}

export function OgLogo({ size = 56 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
      <svg width={size} height={size} viewBox="0 0 64 64">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#E4FF3F" />
            <stop offset="1" stopColor="#19D98C" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill="url(#g)" />
        <g fill="none" stroke="#06130B" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 48V25" />
          <path d="M19 36c0-8 5-12 12-12 3 0 5-1 7-3l7-7" />
          <path d="M36 14h9v9" />
        </g>
      </svg>
      <div style={{ fontSize: size * 0.8, fontWeight: 700, letterSpacing: "-0.05em", color: "#eef3f0" }}>rankr</div>
    </div>
  );
}
