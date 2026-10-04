"use client";

import { useEffect, useMemo } from "react";
import { milestoneAlerts, notify, readSeen, useAlertsOn, writeSeen, type AlertItem } from "@/lib/alerts";
import { tokenHref } from "@/lib/format";
import { marketOf, useAccountCalls, useMyCalls, useTokens, useWatchlistMarkets } from "@/lib/hooks";
import { ratio } from "@/lib/metrics";
import { MAX_LIMIT } from "@/lib/params";
import { useWatchlist } from "@/lib/watchlist";
import { useAuth } from "./AuthProvider";

const NONE: ReturnType<typeof useMyCalls> = [];

/** Watches your calls and watchlist while alerts are on (settings menu) and Rankr is open. */
export function MilestoneAlerts() {
  return useAlertsOn() ? <Watcher /> : null;
}

function Watcher() {
  const { available, userId } = useAuth();
  const watch = useWatchlist();
  const watched = useWatchlistMarkets(watch.map((w) => w.id)).items;
  const device = useMyCalls();
  const accountCalls = useAccountCalls(available ? userId : null).data?.calls;
  // With accounts, your calls come from the server; without, from this browser.
  const deviceCalls = useMemo(() => (available ? NONE : device), [available, device]);

  const ids = useMemo(() => deviceCalls.map((c) => c.id).slice(0, MAX_LIMIT), [deviceCalls]);
  const { tokens } = useTokens(ids);

  useEffect(() => {
    const byId = new Map(tokens.map((t) => [t.id, t]));
    const items: AlertItem[] = [];
    for (const c of accountCalls ?? []) {
      items.push({ key: `call:${c.tokenId}`, symbol: c.token.symbol, multiple: c.multiple, href: tokenHref(c.token), kind: "call" });
    }
    for (const c of deviceCalls) {
      const price = byId.get(c.id)?.market?.priceUsd;
      if (price) items.push({ key: `call:${c.id}`, symbol: c.symbol, multiple: ratio(price, c.entryPriceUsd), href: tokenHref(c), kind: "call" });
    }
    for (const w of watch) {
      const market = marketOf(watched.get(w.id));
      if (market && w.priceUsd) {
        items.push({ key: `watch:${w.id}`, symbol: w.symbol || market.symbol, multiple: ratio(market.priceUsd, w.priceUsd), href: tokenHref(w), kind: "watch" });
      }
    }
    if (!items.length) return;
    const { alerts, seen } = milestoneAlerts(items, readSeen());
    writeSeen(seen);
    for (const a of alerts) void notify(a).catch(() => {});
  }, [tokens, accountCalls, deviceCalls, watch, watched]);

  return null;
}
