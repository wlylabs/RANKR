"use client";

import clsx from "clsx";
import { Star } from "lucide-react";
import { useTokens } from "@/lib/hooks";
import { MAX_LIMIT } from "@/lib/params";
import { toggleWatch, useWatchlist } from "@/lib/watchlist";
import { ListSkeleton, TokenRow } from "./TokenList";

/** Star / unstar on the token page. */
export function WatchButton({ id, symbol }: { id: string; symbol: string }) {
  const watched = useWatchlist().includes(id);
  return (
    <button
      type="button"
      onClick={() => toggleWatch(id)}
      aria-pressed={watched}
      aria-label={watched ? `Stop watching $${symbol}` : `Watch $${symbol}`}
      title={watched ? "On your watchlist" : "Add to watchlist"}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Star className={clsx("size-3.5", watched && "fill-current text-fg")} />
      {watched ? "Watching" : "Watch"}
    </button>
  );
}

/** The starred tokens, live, each measured since its first paste on Rankr. */
export function Watchlist() {
  const ids = useWatchlist();
  const { tokens, isLoading } = useTokens({ ids: ids.slice(0, MAX_LIMIT), limit: MAX_LIMIT });
  // Keep the order they were starred in, newest first.
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const rows = ids.flatMap((id) => byId.get(id) ?? []);

  if (!ids.length) {
    return (
      <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <Star className="mx-auto size-5 text-subtle" />
        <p className="mt-3 font-medium">Nothing on your watchlist</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
          Tap Watch on any token page to follow it here, without making it your call.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-8 overflow-hidden rounded-lg border border-border">
      {isLoading && !rows.length ? (
        <ListSkeleton rows={Math.min(ids.length, 5)} />
      ) : (
        <div className="divide-y divide-border">
          {rows.map((t) => (
            <TokenRow key={t.id} token={t} />
          ))}
        </div>
      )}
    </div>
  );
}
