"use client";

import Link from "next/link";
import { useFeedScope } from "@/lib/feed-scope";
import { useFeed } from "@/lib/hooks";
import type { FeedItem } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { FeedSentence } from "./FeedLine";
import { MultipleBadge } from "./MultipleBadge";
import { LiveDot } from "./PageHeader";
import { TimeAgo } from "./TimeAgo";

const SCOPE_LABEL = { all: null, top: "Top", you: "You" } as const;

/** One entry: the sentence, then the multiple now (for a call) and how long ago. */
function Entry({ item, copy }: { item: FeedItem; copy?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 px-4 font-mono text-[11px] whitespace-nowrap text-muted">
      <FeedSentence item={item} tabIndex={copy ? -1 : undefined} className="flex-nowrap" />
      {item.kind === "call" && <MultipleBadge multiple={item.multiple} size="sm" />}
      <TimeAgo at={item.at} compact className="text-subtle" />
    </span>
  );
}

const MIN_ENTRIES = 10;

/**
 * The live feed as a ticker under the app header, filtered like the feed page (everyone, top callers or yours).
 * It scrolls on its own and stops on hover or focus; with reduced motion it stays put
 * and scrolls by hand.
 */
export function CallTicker() {
  const scope = useFeedScope();
  const { userId } = useAuth();
  const { items } = useFeed({ scope, userId }, 20);
  if (!items.length) return null;

  // A short feed is repeated so one copy is wider than the screen and the loop never shows a gap.
  const loop = Array.from({ length: Math.ceil(MIN_ENTRIES / items.length) }, () => items).flat();
  // Roughly constant speed whatever the number of entries.
  const duration = `${loop.length * 6}s`;

  return (
    <section aria-label="Live feed" className="border-b border-border">
      <div className="mx-auto flex h-8 max-w-6xl items-center">
        <Link
          href="/feed"
          className="label flex shrink-0 items-center gap-1.5 border-r border-border pr-3 pl-4 text-subtle transition-colors hover:text-fg sm:pl-6"
          title="Open the feed"
        >
          <LiveDot />
          Live
          {SCOPE_LABEL[scope] && <span className="text-muted">· {SCOPE_LABEL[scope]}</span>}
        </Link>
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
