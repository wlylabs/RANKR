"use client";

import Link from "next/link";
import { callerHref, formatUsd, tokenHref } from "@/lib/format";
import { useFeed } from "@/lib/hooks";
import type { FeedItem } from "@/lib/types";
import { MultipleBadge } from "./MultipleBadge";
import { OfficialBadge } from "./OfficialBadge";
import { TimeAgo } from "./TimeAgo";

/** "@userx called $SHIB at $1.2B mc +2.4x 3m" (or "$SHIB pasted at ..." when there is no caller). */
function Entry({ item, copy }: { item: FeedItem; copy?: boolean }) {
  const tab = copy ? -1 : undefined;
  return (
    <span className="flex shrink-0 items-center gap-1.5 px-4 font-mono text-[11px] whitespace-nowrap text-muted">
      {item.username ? (
        <>
          <Link href={callerHref(item.username)} tabIndex={tab} className="inline-flex items-center gap-1 text-fg hover:underline">
            @{item.username}
            {item.official && <OfficialBadge className="size-3" />}
          </Link>
          called
        </>
      ) : null}
      <Link href={tokenHref(item.token)} tabIndex={tab} className="font-sans font-medium text-fg hover:underline">
        ${item.token.symbol}
      </Link>
      {!item.username && "pasted"}
      {item.entryMarketCap ? <span>at {formatUsd(item.entryMarketCap)} mc</span> : null}
      <MultipleBadge multiple={item.multiple} size="sm" />
      <TimeAgo at={item.calledAt} compact className="text-subtle" />
    </span>
  );
}

const MIN_ENTRIES = 10;

/**
 * The live call feed as a ticker under the app header. It scrolls on its own and stops on hover or focus;
 * with reduced motion it stays put and scrolls by hand.
 */
export function CallTicker() {
  const { items } = useFeed(20);
  if (!items.length) return null;

  // A short feed is repeated so one copy is wider than the screen and the loop never shows a gap.
  const loop = Array.from({ length: Math.ceil(MIN_ENTRIES / items.length) }, () => items).flat();
  // Roughly constant speed whatever the number of entries.
  const duration = `${loop.length * 6}s`;

  return (
    <section aria-label="Live calls" className="border-b border-border bg-bg">
      <div className="mx-auto flex h-8 max-w-6xl items-center">
        <span className="label flex shrink-0 items-center gap-1.5 border-r border-border pr-3 pl-4 text-subtle sm:pl-6">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-50" />
            <span className="relative inline-flex size-1.5 rounded-full bg-up" />
          </span>
          Live
        </span>
        <div className="ticker-mask min-w-0 flex-1 overflow-hidden">
          <div className="ticker flex w-max" style={{ animationDuration: duration }}>
            <div className="flex">
              {loop.map((item, i) => (
                <Entry key={`${item.id}:${i}`} item={item} copy={i >= items.length} />
              ))}
            </div>
            {/* Second copy so the loop is seamless. */}
            <div className="ticker-copy flex" aria-hidden>
              {loop.map((item, i) => (
                <Entry key={`${item.id}:${i}`} item={item} copy />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
