import { ImageResponse } from "next/og";
import { accountsEnabled, callerCall } from "@/lib/accounts";
import { formatChange, formatMultiple, formatUsd } from "@/lib/format";
import { OG, OG_SIZE, OG_HD_SCALE, OG_HD_SIZE, OgAvatar, OgCheck, OgLogo, ogFonts } from "@/lib/og";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string; chain: string; address: string }> };

/**
 * GET /api/callers/:username/:chain/:address/card -> the call's share card, a 3840x2016 PNG: who called it, at
 * what market cap, and how far it has moved since, from the caller's own entry. The link preview of the call's
 * page, and the image the share dialog saves or shares. Cached a minute: the multiple is live.
 *
 * Sharp at 4K: next/og rasterizes at exactly the width it's given (resvg, fitTo width), with no pixel ratio, so
 * the card is laid out at 1200x630 and scaled up as vectors (text is drawn as glyph paths) before it's rasterized.
 */
export async function GET(_req: Request, { params }: Params) {
  if (!accountsEnabled()) return new Response("Calls need accounts.", { status: 404 });
  const { username, chain, address } = await params;
  const found = await callerCall(decodeURIComponent(username), chain, decodeURIComponent(address)).catch((err) => {
    console.error("[rankr] call card failed", err);
    return null;
  });
  if (!found) return new Response("No such call.", { status: 404 });

  const { caller, call } = found;
  const t = call.token;
  const up = call.multiple > 1.005;
  const down = call.multiple < 0.995;
  const color = up ? OG.up : down ? OG.down : OG.fg;
  const glow = up ? "rgba(63, 185, 80, 0.16)" : "rgba(248, 81, 73, 0.14)";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG.bg }}>
        <div
          style={{
            ...OG_SIZE,
            display: "flex",
            position: "relative",
            flexShrink: 0,
            transform: `scale(${OG_HD_SCALE})`,
            transformOrigin: "top left",
            background: OG.bg,
            color: OG.fg,
            fontFamily: "Geist",
          }}
        >
          {/* The number lights the card in its own color, as on the token page. */}
          {(up || down) && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                display: "flex",
                backgroundImage: `radial-gradient(circle at 22% 62%, ${glow}, transparent 45%)`,
              }}
            />
          )}
          {/* The caller's matrix, large and faint: the card is theirs. */}
          <div style={{ position: "absolute", right: -70, top: 96, display: "flex", opacity: 0.05 }}>
            <OgAvatar userId={caller.userId} size={500} tile="transparent" />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: "100%",
              height: "100%",
              padding: 64,
            }}
          >
            <OgLogo size={40} />

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <OgAvatar userId={caller.userId} size={64} />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "Geist Mono", fontSize: 30 }}>
                    {`@${caller.username}`}
                    {caller.official && <OgCheck size={26} />}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 2, fontSize: 30, color: OG.muted }}>
                    called
                    <span style={{ color: OG.fg, fontWeight: 600 }}>{`$${t.symbol}`}</span>
                    <span style={{ fontSize: 24, color: OG.subtle }}>{t.name}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 28, marginTop: 22 }}>
                <div style={{ fontFamily: "Geist Mono", fontSize: 188, letterSpacing: "-0.07em", lineHeight: 1, color }}>
                  {formatMultiple(call.multiple)}
                </div>
                {up && (
                  <div style={{ fontFamily: "Geist Mono", fontSize: 40, color, marginBottom: 22 }}>{formatChange(call.multiple)}</div>
                )}
              </div>

              <div style={{ display: "flex", marginTop: 22, fontFamily: "Geist Mono", fontSize: 26, color: OG.muted }}>
                {`entry ${formatUsd(call.entryMarketCap)} mc · now ${formatUsd(t.marketCap)}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_HD_SIZE,
      fonts: await ogFonts(),
      headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" },
    },
  );
}
