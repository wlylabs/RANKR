// The feed without accounts (local dev): pastes stand in for calls, and a token's peak since its first
// paste for milestones. Nobody's name is on them.
import { milestoneOf } from "./metrics";
import type { FeedItem, TokenView } from "./types";

export function pasteEvents(tokens: TokenView[], kind: "call" | "milestone" | null): FeedItem[] {
  const items: FeedItem[] = [];
  for (const t of tokens) {
    const base = {
      username: null,
      official: false,
      caller: null,
      token: { id: t.id, chainId: t.chainId, address: t.address, symbol: t.symbol, name: t.name },
      entryMarketCap: t.entryMarketCap,
      multiple: t.multiple,
    };
    if (kind !== "milestone") items.push({ ...base, id: `call:${t.id}`, kind: "call", tier: null, at: t.firstPastedAt });
    const tier = milestoneOf(t.peakMultiple);
    if (tier && kind !== "call") items.push({ ...base, id: `milestone:${t.id}:${tier}`, kind: "milestone", tier, at: t.peakAt });
  }
  return items.sort((a, b) => b.at - a.at);
}
