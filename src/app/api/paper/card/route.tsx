import { ImageResponse } from "next/og";
import { chainMeta } from "@/lib/chains";
import { formatChange, formatMultiple } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { OG, OG_SIZE, OG_HD_SCALE, OG_HD_SIZE, OgLogo, ogFonts } from "@/lib/og";
import { parsePaperCard } from "@/lib/share";

/**
 * GET /api/paper/card?k=t&s=PEPE&c=solana&x=2.4[&o=1][&a=100&b=240[&r=16400]] -> a paper PnL card, a 3840x2016
 * PNG: one token's paper trades (k=t) or the whole paper wallet (k=w&n=<trades>), the move (x, everything back
 * over what went in), and the amounts when asked for (a in, b back, in rupiah at r). Paper trades live on the
 * device, so the card is drawn from the query (see parsePaperCard): it can say no more than a card can, and it
 * always says PAPER. Laid out as the call card is (api/callers/.../card): flat fills, sharp at 4K.
 */
export async function GET(req: Request) {
  const card = parsePaperCard(new URL(req.url).searchParams);
  if (!card) return new Response("Not a paper card.", { status: 400 });

  const up = card.multiple > 1.005;
  const down = card.multiple < 0.995;
  const color = up ? OG.up : down ? OG.down : OG.fg;
  const a = card.amounts;
  const money = (usd: number, signed = false) => (a ? formatMoney(usd, a.currency, a.usdIdr, { signed }) : "");
  // A portfolio reads as a percentage; a trade as Rankr reads every move (2.40x, -37.2%).
  const big = card.kind === "wallet" ? formatChange(card.multiple) : formatMultiple(card.multiple);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG.bg }}>
        <div
          style={{
            ...OG_SIZE,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flexShrink: 0,
            padding: 64,
            transform: `scale(${OG_HD_SCALE})`,
            transformOrigin: "top left",
            background: OG.bg,
            color: OG.fg,
            fontFamily: "Geist",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <OgLogo size={40} />
            {/* Always on it: what this is, so it can't pass for a real trade. */}
            <div
              style={{
                display: "flex",
                border: `3px solid ${OG.muted}`,
                borderRadius: 8,
                padding: "6px 14px",
                fontFamily: "Geist Mono",
                fontSize: 24,
                letterSpacing: "0.18em",
                color: OG.muted,
              }}
            >
              PAPER
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, color: OG.muted }}>
              <div style={{ display: "flex", color: OG.fg, fontWeight: 600 }}>
                {card.kind === "trade" ? `$${card.symbol}` : "Paper portfolio"}
              </div>
              <div style={{ display: "flex" }}>
                {card.kind === "trade"
                  ? `${chainMeta(card.chainId).short} · paper trade, ${card.open ? "open" : "closed"}`
                  : `${card.trades} ${card.trades === 1 ? "trade" : "trades"}`}
              </div>
            </div>

            <div style={{ display: "flex", marginTop: 18, fontFamily: "Geist Mono", fontSize: 188, letterSpacing: "-0.07em", lineHeight: 1, color }}>
              {big}
            </div>

            {a && (
              <div style={{ display: "flex", gap: 18, marginTop: 26, fontFamily: "Geist Mono", fontSize: 30, color: OG.muted }}>
                <span>{`${money(a.inUsd)} in`}</span>
                <span style={{ color: OG.subtle }}>→</span>
                <span>{`${money(a.backUsd)} ${card.kind === "wallet" ? "now" : card.open ? "if sold now" : "back"}`}</span>
                <span style={{ color }}>{money(a.backUsd - a.inUsd, true)}</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", fontSize: 22, color: OG.subtle }}>
            Simulated on Rankr with live DEX prices. No real money, not financial advice.
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
