// What a shared call or paper PnL says (a post on X, the phone's share sheet), next to its link and card.
import { formatChange, formatMultiple, formatUsd } from "./format";
import type { Currency } from "./money";

export type SharedCall = {
  username: string;
  symbol: string;
  entryMarketCap: number | null;
  /** Price now / the caller's entry. */
  multiple: number;
  /** Your own call: said in the first person. */
  mine: boolean;
};

/**
 * "I called $PEPE at $80.2K mc on Rankr. 12.4x since." Someone else's call names them as on Rankr, without an
 * @ (on X that would tag whoever owns the handle there). A call that hasn't moved yet just says it was called;
 * a loss says so too.
 */
export function callShareText({ username, symbol, entryMarketCap, multiple, mine }: SharedCall): string {
  const who = mine ? "I" : username;
  const at = entryMarketCap !== null ? ` at ${formatUsd(entryMarketCap)} mc` : "";
  const called = `${who} called $${symbol}${at} on Rankr.`;
  const moved = multiple > 1.005 || multiple < 0.995;
  return moved ? `${called} ${formatMultiple(multiple)} since.` : called;
}

/** The card's file name when saved: rankr-nonce_7f3a-PEPE.png */
export function callCardFile(username: string, symbol: string): string {
  return `rankr-${username}-${symbol.replace(/[^\w-]/g, "")}.png`;
}

/** The amounts on a paper PnL card, in the currency they're shown in (rupiah at `usdIdr`). */
export type PaperCardAmounts = { inUsd: number; backUsd: number; currency: Currency; usdIdr: number | null };

/**
 * A paper PnL card: one token's trades (`open` while some is still held) or the whole paper wallet. `multiple`:
 * everything back over what went in. `amounts`: null to leave the money off the card, only the move on it.
 */
export type PaperCard = ({ kind: "trade"; symbol: string; chainId: string; open: boolean } | { kind: "wallet"; trades: number }) & {
  multiple: number;
  amounts: PaperCardAmounts | null;
};

const SIMULATED = "Simulated, no real money.";

/**
 * "Paper-traded $PEPE on Rankr: 2.40x. Simulated, no real money." Always says it's paper: a paper trade passed
 * off as a real one is the card's one way to mislead.
 */
export function paperShareText(card: PaperCard): string {
  const moved = card.multiple > 1.005 || card.multiple < 0.995;
  if (card.kind === "wallet") {
    return moved
      ? `My Rankr paper portfolio: ${formatChange(card.multiple)} since the start. ${SIMULATED}`
      : `My Rankr paper portfolio. ${SIMULATED}`;
  }
  const did = `${card.open ? "Paper-trading" : "Paper-traded"} $${card.symbol} on Rankr`;
  return moved ? `${did}: ${formatMultiple(card.multiple)}${card.open ? " so far" : ""}. ${SIMULATED}` : `${did}. ${SIMULATED}`;
}

/** The card's file name when saved: rankr-paper-PEPE.png, rankr-paper-portfolio.png */
export function paperCardFile(card: PaperCard): string {
  return `rankr-paper-${card.kind === "wallet" ? "portfolio" : card.symbol.replace(/[^\w-]/g, "") || "trade"}.png`;
}

/** The card as the query of its image's URL (see api/paper/card): only what's on it. */
export function paperCardQuery(card: PaperCard): string {
  const q = new URLSearchParams({ k: card.kind === "wallet" ? "w" : "t", x: String(card.multiple) });
  if (card.kind === "trade") {
    q.set("s", card.symbol);
    q.set("c", card.chainId);
    if (card.open) q.set("o", "1");
  } else q.set("n", String(card.trades));
  if (card.amounts) {
    q.set("a", String(card.amounts.inUsd));
    q.set("b", String(card.amounts.backUsd));
    if (card.amounts.currency === "idr" && card.amounts.usdIdr) q.set("r", String(card.amounts.usdIdr));
  }
  return q.toString();
}

/** A number from the query within [min, max], or null. */
function num(q: URLSearchParams, key: string, min: number, max: number): number | null {
  const raw = q.get(key);
  const n = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * The card a query asks for, or null when it isn't one. Anyone can write a query, so it's held to what a card
 * can say: a short ticker, a chain id, numbers in range, and nothing else drawn.
 */
export function parsePaperCard(q: URLSearchParams): PaperCard | null {
  let multiple = num(q, "x", 0, 1e6);
  if (multiple === null) return null;
  let amounts: PaperCardAmounts | null = null;
  if (q.has("a") || q.has("b")) {
    const inUsd = num(q, "a", 0.01, 1e12);
    const backUsd = num(q, "b", 0, 1e12);
    if (inUsd === null || backUsd === null) return null;
    const usdIdr = q.has("r") ? num(q, "r", 1, 1e6) : null;
    if (q.has("r") && usdIdr === null) return null;
    amounts = { inUsd, backUsd, currency: usdIdr ? "idr" : "usd", usdIdr };
  }
  // With the amounts on it, the move is theirs: the card can't show one that doesn't add up.
  if (amounts) multiple = amounts.backUsd / amounts.inUsd;
  const kind = q.get("k");
  if (kind === "w") {
    const trades = num(q, "n", 0, 10_000);
    return trades === null || !Number.isInteger(trades) ? null : { kind: "wallet", trades, multiple, amounts };
  }
  if (kind !== "t") return null;
  const symbol = (q.get("s") ?? "").replace(/[^\p{L}\p{N}_.-]/gu, "").slice(0, 16);
  const chainId = q.get("c") ?? "";
  if (!symbol || !/^[a-z0-9-]{1,24}$/.test(chainId)) return null;
  return { kind: "trade", symbol, chainId, open: q.get("o") === "1", multiple, amounts };
}
