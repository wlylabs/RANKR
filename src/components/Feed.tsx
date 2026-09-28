"use client";

import clsx from "clsx";
import { ChevronDown, Radio } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { chainMeta } from "@/lib/chains";
import { setFeedScope, useFeedScope } from "@/lib/feed-scope";
import { useFeedPages, useStats } from "@/lib/hooks";
import { FEED_KINDS, FEED_SCOPES, parseFeedKind, type FeedKind, type FeedScope } from "@/lib/params";
import { accountsAvailable } from "@/lib/supabase-browser";
import type { FeedItem } from "@/lib/types";
import { FeedSentence } from "./FeedLine";
import { Tab } from "./Leaderboard";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ListSkeleton } from "./TokenList";

const SCOPE_LABELS: Record<FeedScope, string> = { all: "Everyone", top: "Top callers" };
const KIND_LABELS: Record<FeedKind, string> = { all: "All", call: "Calls", milestone: "Milestones" };

/** One feed entry: the sentence, the multiple now, and how long ago. */
export function FeedRow({ item }: { item: FeedItem }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        aria-hidden
        className={clsx("mt-[7px] size-1.5 shrink-0 rounded-full", item.kind === "milestone" ? "bg-up" : "bg-border-strong")}
      />
      <FeedSentence item={item} className="min-w-0 flex-1 font-mono text-[13px] text-muted" />
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="flex items-baseline gap-1">
          <span className="font-mono text-[10px] text-subtle">now</span>
          <MultipleBadge multiple={item.multiple} size="sm" />
        </span>
        <TimeAgo at={item.at} compact className="font-mono text-[11px] text-subtle" />
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <Radio className="mx-auto size-5 text-subtle" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>
    </div>
  );
}

/** Every call and every milestone, newest first, filtered by callers, kind and chain. */
export function Feed() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const picked = useFeedScope();
  const scope = accountsAvailable ? picked : "all";
  const kind = parseFeedKind(params.get("kind"));
  const chain = params.get("chain") ?? "all";
  const chains = useStats().stats?.chains ?? [];

  const { items, hasMore, isLoading, isValidating, loadMore } = useFeedPages({
    scope,
    kind,
    chain: chain === "all" ? null : chain,
  });

  function setParam(key: string, value: string, fallback: string) {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const loading = isLoading && !items.length;

  return (
    <div className="pt-10 sm:pt-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Feed</h1>
      <p className="mt-1.5 text-sm text-muted">
        Every call as it lands, and every call that hits 2x, 5x, 10x and up, each from the caller&apos;s own entry.
      </p>

      {accountsAvailable && (
        <div
          className="scrollbar-none fade-end -mx-4 mt-6 flex gap-6 overflow-x-auto border-b border-border pr-10 pl-4 sm:mx-0 sm:px-0"
          role="tablist"
          aria-label="Callers"
        >
          {FEED_SCOPES.map((s) => (
            <Tab key={s} active={scope === s} onClick={() => setFeedScope(s)}>
              {SCOPE_LABELS[s]}
            </Tab>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <div className="flex h-9 items-center rounded-md border border-border p-0.5" role="group" aria-label="Kind">
          {FEED_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setParam("kind", k, "all")}
              aria-pressed={kind === k}
              className={clsx(
                "h-full rounded px-2.5 text-xs transition-colors",
                kind === k ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg",
              )}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="relative ml-auto min-w-0 flex-1 sm:flex-none">
          <select
            value={chain}
            onChange={(e) => setParam("chain", e.target.value, "all")}
            aria-label="Chain"
            className="h-9 w-full cursor-pointer appearance-none rounded-md border border-border bg-bg pr-8 pl-3 text-sm text-fg outline-none transition-colors hover:bg-surface-2 focus-visible:border-border-strong sm:w-auto"
          >
            <option value="all">All chains</option>
            {chains.map((c) => (
              <option key={c} value={c}>
                {chainMeta(c).name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-subtle" />
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="rounded-lg border border-border">
            <ListSkeleton rows={8} />
          </div>
        ) : !items.length ? (
          <Empty
            title="Nothing here yet"
            body={kind !== "all" || chain !== "all" ? "Try another kind or chain." : "Calls show up here the moment someone pastes a CA."}
          />
        ) : (
          <>
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {items.map((item) => (
                <FeedRow key={item.id} item={item} />
              ))}
            </div>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={isValidating}
                className="mt-4 h-9 w-full rounded-md border border-border text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
              >
                {isValidating ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
