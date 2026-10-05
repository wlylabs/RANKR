import { ImageResponse } from "next/og";
import { markElements } from "@/components/Logo";
import { chainMeta } from "@/lib/chains";
import { formatChange, formatMultiple } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { OG, OG_SIZE, OG_HD_SCALE, OG_HD_SIZE, OgLogo, ogFonts } from "@/lib/og";
import { CARD_TICKERS, parsePaperCard } from "@/lib/share";

/** A small outlined mono tag: the chain, OPEN / CLOSED, PAPER. */
function Tag({ children, color = OG.muted, size = 20 }: { children: string; color?: string; size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        border: `2px solid ${OG.border}`,
        borderRadius: 8,
        padding: "5px 12px",
        fontFamily: "Geist Mono",
        fontSize: size,
        letterSpacing: "0.14em",
        color,
      }}
    >
      {children}
    </div>
  );
}

/** One figure under the move: a small label over the amount. */
function Stat({ label, value, color = OG.fg }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", paddingRight: 44, marginRight: 44, borderRight: `2px solid ${OG.border}` }}>
      <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 18, letterSpacing: "0.14em", color: OG.subtle }}>{label}</div>
      <div style={{ display: "flex", marginTop: 8, fontFamily: "Geist Mono", fontSize: 32, color }}>{value}</div>
    </div>
  );
}

/**
 * GET /api/paper/card?k=t&s=PEPE&c=solana&x=2.4[&o=1][&a=100&b=240[&r=16400]] -> a paper PnL card, a 3840x2016
 * PNG: one token's paper trades (k=t) or the whole paper wallet (k=w&n=<trades>&m=<tokens>&t=PEPE,WIF), the move
 * (x, everything back over what went in), and the amounts when asked for (a in, b back, in rupiah at r). Paper
 * trades live on the device, so the card is drawn from the query (see parsePaperCard): it can say no more than a
 * card can, and it's always marked PAPER. Laid out as the call card is (api/callers/.../card): flat fills and
 * vector shapes, sharp at 4K and clean after X re-encodes it.
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
  const tickers = card.kind === "wallet" ? card.tickers.slice(0, CARD_TICKERS) : [card.symbol];
  const more = card.kind === "wallet" ? card.tokens - tickers.length : 0;

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
          {/* Rankr's mark, large and faint, as the call card has the caller's. */}
          <div style={{ position: "absolute", right: -60, top: 70, display: "flex", opacity: 0.045 }}>
            <svg width={520} height={520} viewBox="0 0 64 64">
              {markElements(OG.fg, OG.fg, 0.5)}
            </svg>
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 64 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <OgLogo size={40} />
              <Tag>PAPER</Tag>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ display: "flex", gap: 22, fontSize: 52, fontWeight: 600, letterSpacing: "-0.03em" }}>
                  {tickers.map((t) => (
                    <span key={t}>{`$${t}`}</span>
                  ))}
                  {more > 0 && <span style={{ color: OG.subtle }}>{`+${more}`}</span>}
                </div>
                {card.kind === "trade" && <Tag>{chainMeta(card.chainId).short}</Tag>}
                {card.kind === "trade" && <Tag color={card.open ? OG.fg : OG.muted}>{card.open ? "OPEN" : "CLOSED"}</Tag>}
              </div>

              <div style={{ display: "flex", marginTop: 6, fontFamily: "Geist Mono", fontSize: 200, letterSpacing: "-0.07em", lineHeight: 1.05, color }}>
                {big}
              </div>

              {a && (
                <div style={{ display: "flex", marginTop: 28 }}>
                  <Stat label="IN" value={money(a.inUsd)} />
                  <Stat label={card.kind === "trade" && !card.open ? "BACK" : "NOW"} value={money(a.backUsd)} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 18, letterSpacing: "0.14em", color: OG.subtle }}>PNL</div>
                    <div style={{ display: "flex", marginTop: 8, fontFamily: "Geist Mono", fontSize: 32, color }}>{money(a.backUsd - a.inUsd, true)}</div>
                  </div>
                </div>
              )}
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
