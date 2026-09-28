// What a shared call says (a post on X, the phone's share sheet), next to its link and card.
import { formatMultiple, formatUsd } from "./format";

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
 * "I called $PEPE at $80.2K mc. 12.4x since, sealed on Rankr." Someone else's call names them as on Rankr,
 * without an @ (on X that would tag whoever owns the handle there). A call that hasn't moved yet just says
 * when it was called; a loss says so too.
 */
export function callShareText({ username, symbol, entryMarketCap, multiple, mine }: SharedCall): string {
  const who = mine ? "I" : username;
  const at = entryMarketCap !== null ? ` at ${formatUsd(entryMarketCap)} mc` : "";
  const moved = multiple > 1.005 || multiple < 0.995;
  return moved
    ? `${who} called $${symbol}${at}. ${formatMultiple(multiple)} since, sealed on Rankr.`
    : `${who} called $${symbol}${at}, sealed on Rankr.`;
}

/** The card's file name when saved: rankr-nonce_7f3a-PEPE.png */
export function callCardFile(username: string, symbol: string): string {
  return `rankr-${username}-${symbol.replace(/[^\w-]/g, "")}.png`;
}
