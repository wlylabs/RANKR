"use client";

import { useEffect, useMemo } from "react";
import { milestoneAlerts, notify, readSeen, useAlertsOn, writeSeen, type AlertItem } from "@/lib/alerts";
import { tokenHref } from "@/lib/format";
import { useAccountCalls, useMyCalls, useTokens } from "@/lib/hooks";
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
  const device = useMyCalls();
  const accountCalls = useAccountCalls(available ? userId : null).data?.calls;
  // With accounts, your calls come from the server; without, from this browser.
  const deviceCalls = useMemo(() => (available ? NONE : device), [available, device]);

  const ids = useMemo(
    () => [...new Set([...watch, ...deviceCalls.map((c) => c.id)])].slice(0, MAX_LIMIT),
    [watch, deviceCalls],
  );
  const { tokens } = useTokens({ ids, limit: MAX_LIMIT });

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
    for (const id of watch) {
      const t = byId.get(id);
      if (t) items.push({ key: `watch:${id}`, symbol: t.symbol, multiple: t.multiple, href: tokenHref(t), kind: "watch" });
    }
    if (!items.length) return;
    const { alerts, seen } = milestoneAlerts(items, readSeen());
    writeSeen(seen);
    for (const a of alerts) void notify(a).catch(() => {});
  }, [tokens, accountCalls, deviceCalls, watch]);

  return null;
}
