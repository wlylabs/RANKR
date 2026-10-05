"use client";

import clsx from "clsx";
import Link from "next/link";
import { callerHref, formatUsd, tokenHref } from "@/lib/format";
import { MIN_CALLS_RATED } from "@/lib/params";
import type { FeedItem } from "@/lib/types";
import { OfficialBadge } from "./OfficialBadge";

/** The caller's hit rate (calls at 2x+ right now), once they have enough calls for it to mean something. */
function HitRate({ caller }: { caller: FeedItem["caller"] }) {
  if (!caller || caller.calls < MIN_CALLS_RATED) return null;
  return (
    <span
      className="rounded border border-border px-1 text-[10px] leading-4 text-subtle"
      title={`${caller.hits} of ${caller.calls} calls at 2x+ right now`}
    >
      {Math.round((caller.hits / caller.calls) * 100)}% hit
    </span>
  );
}

function Caller({ item, possessive }: { item: FeedItem; possessive?: boolean }) {
  if (!item.username) return null;
  return (
    <>
      <Link href={callerHref(item.username)} className="inline-flex items-center gap-1 text-fg hover:underline">
        @{item.username}
        {item.official && <OfficialBadge className="size-3" />}
        {possessive && <span className="-ml-1">&apos;s</span>}
      </Link>
      {!possessive && <HitRate caller={item.caller} />}
    </>
  );
}

function Token({ item }: { item: FeedItem }) {
  return (
    <Link href={tokenHref(item.token)} className="font-sans font-medium text-fg hover:underline">
      ${item.token.symbol}
    </Link>
  );
}

/**
 * The words of a feed entry, as inline pieces:
 * "@userx 64% hit called $SHIB at $1.2B mc", "$PEPE hit 10x from @userx's call at $80K mc",
 * and without accounts "$SHIB pasted at $1.2B mc" / "$PEPE hit 10x since paste".
 */
export function FeedSentence({ item, className }: { item: FeedItem; className?: string }) {
  const mc = item.entryMarketCap ? <span>at {formatUsd(item.entryMarketCap)} mc</span> : null;
  if (item.kind === "milestone") {
    return (
      <span className={clsx("inline-flex flex-wrap items-center gap-x-1.5", className)}>
        <Token item={item} />
        hit
        <span className={clsx("font-semibold text-up", (item.tier ?? 0) >= 10 && "underline decoration-up/40 underline-offset-2")}>
          {item.tier}x
        </span>
        {item.username ? (
          <>
            from <Caller item={item} possessive /> call
            {mc}
          </>
        ) : (
          <>since paste {mc}</>
        )}
      </span>
    );
  }
  return (
    <span className={clsx("inline-flex flex-wrap items-center gap-x-1.5", className)}>
      {item.username && (
        <>
          <Caller item={item} /> called
        </>
      )}
      <Token item={item} />
      {!item.username && "pasted"}
      {mc}
    </span>
  );
}
