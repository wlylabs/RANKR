import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgLogo, ogFonts } from "@/lib/og";

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
          background: OG.bg,
          color: OG.fg,
          fontFamily: "Geist",
        }}
      >
        <OgLogo size={48} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: "Geist Mono", fontSize: 92, letterSpacing: "-0.06em", lineHeight: 1.05 }}>Paste a CA.</div>
          <div style={{ fontFamily: "Geist Mono", fontSize: 92, letterSpacing: "-0.06em", lineHeight: 1.05, color: OG.muted }}>
            Watch it rank.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: OG.muted }}>
            Entry sealed at the first paste. Every 2x, 10x, 100x tracked live.
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
