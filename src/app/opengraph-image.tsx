import { ImageResponse } from "next/og";
import { OG_SIZE, OgLogo, ogFonts } from "@/lib/og";

export const alt = "Rankr: paste a CA, watch it rank";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(circle at 50% -10%, #1d3a12 0%, #07090b 60%)",
          color: "#eef3f0",
        }}
      >
        <OgLogo size={64} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>Paste a CA.</div>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.1, color: "#d4ff3a" }}>
            Watch it rank.
          </div>
          <div style={{ marginTop: 28, fontSize: 32, color: "#93a09a" }}>
            Entry locked at the first paste. Every 2x, 10x, 100x (or the dump) tracked live.
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
