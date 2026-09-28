"use client";

import clsx from "clsx";
import { Star, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { formatUsd, tokenHref } from "@/lib/format";
import { marketOf, useWatchlistMarkets } from "@/lib/hooks";
import { ratio } from "@/lib/metrics";
import type { MarketSnapshot, TokenView, WatchlistResponse } from "@/lib/types";
import { settle, unwatch, useWatchlist, watch, watchedFrom, type Watched } from "@/lib/watchlist";
import { ChainTag } from "./Chain";
import { Cascade } from "./Cinema";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ListSkeleton, TokenName } from "./TokenList";

/** Star / unstar, at the price now. For a token on Rankr, or live data for one that isn't. */
export function WatchButton({ token }: { token: TokenView | MarketSnapshot }) {
  const entry = watchedFrom(token);
  const watched = useWatchlist().some((w) => w.id === entry.id);
  return (
    <button
      type="button"
      onClick={() => (watched ? unwatch(entry.id) : watch(entry))}
      aria-pressed={watched}
      aria-label={watched ? `Stop watching $${token.symbol}` : `Watch $${token.symbol}`}
      title={watched ? "On your watchlist" : "Add to watchlist, without calling it"}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Star className={clsx("size-3.5", watched && "fill-current text-fg")} />
      {watched ? "Watching" : "Watch"}
    </button>
  );
}

function WatchRow({ w, item, loading }: { w: Watched; item: WatchlistResponse["items"][number] | undefined; loading: boolean }) {
  const market = marketOf(item);
  const symbol = w.symbol || market?.symbol || "…";
  const name = w.name || market?.name || "";
  const mc = item?.token?.marketCap ?? market?.marketCap ?? market?.fdv ?? null;
  const multiple = market && w.priceUsd ? ratio(market.priceUsd, w.priceUsd) : null;
  return (
    <div className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
      <Link href={tokenHref(w)} className="min-w-0 flex-1 after:absolute after:inset-0">
        <TokenName symbol={symbol} name={name} />
        <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
          <ChainTag chainId={w.chainId} /> · mc {formatUsd(mc)}
          {w.at > 0 && (
            <>
              {" "}
              · saved <TimeAgo at={w.at} compact />
            </>
          )}
        </div>
      </Link>
      {multiple != null ? (
        <MultipleBadge multiple={multiple} />
      ) : (
        <span className="font-mono text-xs text-subtle">{loading ? "…" : "no data"}</span>
      )}
      <button
        type="button"
        onClick={() => unwatch(w.id)}
        aria-label={`Remove $${symbol} from your watchlist`}
        className="relative z-10 -mr-1.5 grid size-8 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Tokens saved on this device, live, each measured from when it was saved. None of them is a call. */
export function Watchlist() {
  const list = useWatchlist();
  const { items, isLoading } = useWatchlistMarkets(list.map((w) => w.id));

  // Stars from before prices were kept: measured from the token's first paste, as they were then.
  useEffect(() => {
    for (const w of list) {
      const t = w.priceUsd == null ? items.get(w.id)?.token : null;
      if (t) settle(w.id, t);
    }
  }, [list, items]);

  if (!list.length) {
    return (
      <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <Star className="mx-auto size-5 text-subtle" />
        <p className="mt-3 font-medium">Nothing on your watchlist</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
          Paste a CA and choose Save to watchlist, or tap Watch on a token page. It&apos;s private, on this device, and
          not a call.
        </p>
      </div>
    );
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted">
        Measured from when you saved each one. Private, on this device, and not calls.
      </p>
      <div className="mt-4 overflow-hidden card">
        {isLoading && !items.size ? (
          <ListSkeleton rows={Math.min(list.length, 5)} />
        ) : (
          <Cascade className="divide-y divide-border">
            {list.map((w) => (
              <WatchRow key={w.id} w={w} item={items.get(w.id)} loading={isLoading} />
            ))}
          </Cascade>
        )}
      </div>
    </>
  );
}
