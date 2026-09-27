import { ImageResponse } from "next/og";
import { chainMeta } from "@/lib/chains";
import { formatChange, formatDate, formatMultiple, formatUsd } from "@/lib/format";
import { tierOf } from "@/lib/metrics";
import { OG_SIZE, OgLogo, ogFonts } from "@/lib/og";
import { getToken } from "@/lib/rankr";

export const alt = "Token performance on Rankr";
export const size = OG_SIZE;
export const contentType = "image/png";

const COLORS = { moon: "#ffc53d", pump: "#2be48a", up: "#2be48a", flat: "#eef3f0", down: "#ff5470", rekt: "#ff5470" };

export default async function Image({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  const { token } = await getToken(chain, decodeURIComponent(address)).catch(() => ({ token: null }));
  const color = token ? COLORS[tierOf(token.multiple)] : "#eef3f0";

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
          background: `radial-gradient(circle at 85% 0%, ${color}33 0%, #07090b 55%)`,
          color: "#eef3f0",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <OgLogo size={52} />
          <div style={{ fontSize: 28, color: "#93a09a" }}>{chainMeta(chain).name}</div>
        </div>
        {token ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 60, fontWeight: 700 }}>{`$${token.symbol}`}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 32 }}>
              <div style={{ fontSize: 200, fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 1, color }}>
                {formatMultiple(token.multiple)}
              </div>
              <div style={{ fontSize: 44, fontWeight: 700, color, marginBottom: 24 }}>{formatChange(token.multiple)}</div>
            </div>
            <div style={{ marginTop: 20, fontSize: 32, color: "#93a09a" }}>
              {`Entry ${formatUsd(token.entryMarketCap)} MC → now ${formatUsd(token.marketCap)} · first pasted ${formatDate(token.firstPastedAt)}`}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 72, fontWeight: 700 }}>Track this token on Rankr</div>
        )}
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
