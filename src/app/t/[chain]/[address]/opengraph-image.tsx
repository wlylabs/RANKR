import { ImageResponse } from "next/og";
import { chainMeta } from "@/lib/chains";
import { formatChange, formatDate, formatMultiple, formatUsd } from "@/lib/format";
import { OG, OG_SIZE, OgLogo, ogFonts } from "@/lib/og";
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <OgLogo size={44} />
          <div style={{ fontFamily: "Geist Mono", fontSize: 24, color: OG.subtle }}>{chainMeta(chain).name.toLowerCase()}</div>
        </div>
        {token ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <div style={{ fontSize: 60, fontWeight: 600, letterSpacing: "-0.03em" }}>{`$${token.symbol}`}</div>
              <div style={{ fontSize: 34, color: OG.muted }}>{token.name}</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 32, marginTop: 6 }}>
              <div style={{ fontFamily: "Geist Mono", fontSize: 190, letterSpacing: "-0.07em", lineHeight: 1, color }}>
                {formatMultiple(token.multiple)}
              </div>
              <div style={{ fontFamily: "Geist Mono", fontSize: 40, color, marginBottom: 22 }}>{formatChange(token.multiple)}</div>
            </div>
            <div style={{ marginTop: 22, fontFamily: "Geist Mono", fontSize: 24, color: OG.muted }}>
              {`entry ${formatUsd(token.entryMarketCap)} → now ${formatUsd(token.marketCap)} · ${formatDate(token.firstPastedAt).toLowerCase()}`}
            </div>
            <div style={{ marginTop: 10, fontFamily: "Geist Mono", fontSize: 20, color: OG.subtle }}>
              {`seal sha256 ${token.seal.slice(0, 32)}…`}
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: "Geist Mono", fontSize: 72, letterSpacing: "-0.05em" }}>Track this token on Rankr</div>
        )}
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
