import { ImageResponse } from "next/og";
import { chainMeta } from "@/lib/chains";
import { formatChange, formatDate, formatMultiple, formatUsd } from "@/lib/format";
import { OG, OG_SIZE, OgLogo, ogBackground, ogFonts } from "@/lib/og";
import { getToken } from "@/lib/rankr";

export const alt = "Token performance on Rankr";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  const { token } = await getToken(chain, decodeURIComponent(address)).catch(() => ({ token: null }));
  const color = !token ? OG.fg : token.multiple > 1.005 ? OG.up : token.multiple < 0.995 ? OG.down : OG.fg;

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <OgLogo size={52} />
          <div
            style={{
              fontFamily: "Geist Mono",
              fontSize: 24,
              letterSpacing: 2,
              color: OG.muted,
              border: `2px solid ${OG.border}`,
              borderRadius: 8,
              padding: "8px 16px",
            }}
          >
            {chainMeta(chain).name.toUpperCase()}
          </div>
        </div>
        {token ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Pixel", fontSize: 64 }}>{`$${token.symbol}`}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 36, marginTop: 8 }}>
              <div style={{ fontFamily: "Pixel", fontSize: 210, lineHeight: 0.95, color }}>
                {formatMultiple(token.multiple)}
              </div>
              <div style={{ fontFamily: "Geist Mono", fontSize: 44, color, marginBottom: 18 }}>
                {formatChange(token.multiple)}
              </div>
            </div>
            <div style={{ marginTop: 28, fontFamily: "Geist Mono", fontSize: 26, color: OG.muted }}>
              {`ENTRY ${formatUsd(token.entryMarketCap)} → NOW ${formatUsd(token.marketCap)} · ${formatDate(token.firstPastedAt).toUpperCase()}`}
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: "Pixel", fontSize: 84 }}>Track this token on Rankr</div>
        )}
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
