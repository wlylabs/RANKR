import { ImageResponse } from "next/og";
import { markElements } from "@/components/Logo";
import { chainMeta } from "@/lib/chains";
import { formatChange, formatMultiple } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { OG, OG_SIZE, OG_HD_SCALE, OG_HD_SIZE, OgLogo, ogFonts } from "@/lib/og";
import { CARD_TICKERS, parsePaperCard } from "@/lib/share";

/**
 * GET /api/paper/card?k=t&s=PEPE&c=solana&x=2.4[&o=1][&a=100&b=240[&r=16400]] -> a paper PnL card, a 3840x2016
 * PNG: one token's paper trades (k=t) or the whole paper wallet (k=w&n=<trades>&m=<tokens>&t=PEPE,WIF), the move
 * (x, everything back over what went in), and the amounts when asked for (a in, b back, in rupiah at r). Paper
 * trades live on the device, so the card is drawn from the query (see parsePaperCard): it can say no more than a
 * card can. Laid out as the call card is (api/callers/.../card), Rankr's mark where the caller's matrix is: flat
 * fills and vector shapes, sharp at 4K and clean after X re-encodes it.
 */
export async function GET(req: Request) {
  const card = parsePaperCard(new URL(req.url).searchParams);
  if (!card) return new Response("Not a paper card.", { status: 400 });

  const up = card.multiple > 1.005;
  const down = card.multiple < 0.995;
  const color = up ? OG.up : down ? OG.down : OG.fg;
  const a = card.amounts;
  const money = (usd: number, signed = false) => (a ? formatMoney(usd, a.currency, a.usdIdr, { signed }) : "");
  const tickers = card.kind === "wallet" ? card.tickers.slice(0, CARD_TICKERS) : [card.symbol];
  const more = card.kind === "wallet" ? card.tokens - tickers.length : 0;
  const verb = card.kind === "wallet" ? "trading" : card.open ? "holding" : "traded";
  // Under the move: the amounts when they're on it, else where and how it stands.
  const line = a
    ? `${money(a.inUsd)} in · ${money(a.backUsd)} ${card.kind === "trade" && !card.open ? "back" : "now"} · ${money(a.backUsd - a.inUsd, true)}`
    : card.kind === "trade"
      ? `on ${chainMeta(card.chainId).name} · ${card.open ? "open" : "closed"}`
      : `${card.trades} ${card.trades === 1 ? "trade" : "trades"}`;

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
          {/* Rankr's mark, large and faint, where the call card has the caller's matrix. */}
          <div style={{ position: "absolute", right: -70, top: 96, display: "flex", opacity: 0.05 }}>
            <svg width={500} height={500} viewBox="0 0 64 64">
              {markElements(OG.fg, OG.fg, 0.5)}
            </svg>
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
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 30, color: OG.muted }}>
                {verb}
                {tickers.map((t) => (
                  <span key={t} style={{ color: OG.fg, fontWeight: 600 }}>{`$${t}`}</span>
                ))}
                {more > 0 && <span style={{ color: OG.subtle }}>{`+${more}`}</span>}
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 28, marginTop: 22 }}>
                <div style={{ fontFamily: "Geist Mono", fontSize: 188, letterSpacing: "-0.07em", lineHeight: 1, color }}>
                  {formatMultiple(card.multiple)}
                </div>
                {up && <div style={{ fontFamily: "Geist Mono", fontSize: 40, color, marginBottom: 22 }}>{formatChange(card.multiple)}</div>}
              </div>

              <div style={{ display: "flex", marginTop: 22, fontFamily: "Geist Mono", fontSize: 26, color: OG.muted }}>{line}</div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_HD_SIZE,
      fonts: await ogFonts(),
      // The same query always draws the same card.
      headers: { "cache-control": "public, max-age=86400, s-maxage=86400, immutable" },
    },
  );
}
