import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgLogo, ogBackground, ogFonts } from "@/lib/og";

export const alt = "Rankr: paste a CA, watch it rank";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          ...ogBackground,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: OG.fg,
          fontFamily: "Geist",
        }}
      >
        <OgLogo size={60} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: "Pixel", fontSize: 104, lineHeight: 1.05 }}>Paste a CA.</div>
          <div style={{ display: "flex", alignItems: "flex-end", fontFamily: "Pixel", fontSize: 104, lineHeight: 1.05 }}>
            Watch it rank
            <div style={{ width: 52, height: 84, marginLeft: 10, marginBottom: 14, background: OG.orange }} />
          </div>
          <div style={{ marginTop: 30, fontSize: 30, color: OG.muted }}>
            Entry locked at the first paste. Every 2x, 10x, 100x tracked live.
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
