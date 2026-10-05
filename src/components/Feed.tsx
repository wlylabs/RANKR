"use client";

import clsx from "clsx";
import { ArrowUp, ChevronDown, Radio } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { chainMeta } from "@/lib/chains";
import { setFeedScope, useFeedScope } from "@/lib/feed-scope";
import { dayLabel } from "@/lib/format";
import { useFeedPages, useNow, useStats } from "@/lib/hooks";
import { loginHref } from "@/lib/login";
import { parseFeedKind, parseFeedScope, type FeedKind, type FeedScope } from "@/lib/params";
import { accountsAvailable } from "@/lib/supabase-browser";
import type { FeedItem } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { SignalField } from "./Backdrops";
import { Cascade } from "./Cinema";
import { FeedSentence } from "./FeedLine";
import { MultipleBadge } from "./MultipleBadge";
import { LiveDot, PageHeader } from "./PageHeader";
import { Segmented, TabBar } from "./Tabs";
import { TimeAgo } from "./TimeAgo";
import { ListSkeleton } from "./TokenList";

const SCOPE_LABELS: Record<FeedScope, string> = { all: "Everyone", you: "You" };
const KIND_LABELS: Record<FeedKind, string> = { all: "All", call: "Calls", milestone: "Milestones" };

/** One feed entry: the sentence, the multiple now, and how long ago. */
export function FeedRow({ item }: { item: FeedItem }) {
  // A milestone just hit: a band of green light passes over it as it lands.
  const hit = item.kind === "milestone";
  return (
    <div
      className={clsx("flex items-start gap-3 px-4 py-3", hit && "sweep")}
      style={hit ? ({ "--sweep": "var(--up)" } as React.CSSProperties) : undefined}
    >
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

/** Entries under a heading per day: Today, Yesterday, Sep 25... */
function byDay(items: FeedItem[], now: number): { label: string; items: FeedItem[] }[] {
  const days: { label: string; items: FeedItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.at, now);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(item);
    else days.push({ label, items: [item] });
  }
  return days;
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

/**
 * Every call and every milestone, newest first, by day, filtered by callers (everyone or your own), kind and
 * chain. Entries that land while you read wait behind an "N new" button instead of pushing
 * the list down.
 */
export function Feed() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { ready, userId } = useAuth();
  const now = useNow(60_000);
  // The callers filter is in the URL; without one, the last one picked.
  const stored = useFeedScope();
  const inUrl = params.get("scope");
  const scope = accountsAvailable ? (inUrl ? parseFeedScope(inUrl) : stored) : "all";
  // A link with a filter becomes the one picked, so the feed opens on it next time.
  useEffect(() => {
    if (accountsAvailable && inUrl && scope !== stored) setFeedScope(scope);
  }, [inUrl, scope, stored]);
  const kind = parseFeedKind(params.get("kind"));
  const chain = params.get("chain") ?? "all";
  const chains = useStats().stats?.chains ?? [];

  const { items, hasMore, isLoading, isValidating, loadMore } = useFeedPages({
    scope,
    kind,
    chain: chain === "all" ? null : chain,
    userId,
  });

  // The newest entry shown for these filters; anything newer waits behind the "N new" button.
  const filters = `${scope}:${kind}:${chain}:${userId}`;
  const [seen, setSeen] = useState<{ filters: string; at: number } | null>(null);
  const seenAt = seen?.filters === filters ? seen.at : null;
  const newest = items[0]?.at;
  useEffect(() => {
    if (seenAt === null && newest !== undefined) setSeen({ filters, at: newest });
  }, [seenAt, newest, filters]);
  const fresh = seenAt === null ? 0 : items.filter((i) => i.at > seenAt).length;
  const shown = seenAt === null ? items : items.filter((i) => i.at <= seenAt);

  function showNew() {
    if (newest !== undefined) setSeen({ filters, at: newest });
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }

  function setParam(key: string, value: string, fallback: string) {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  function pickScope(s: FeedScope) {
    setFeedScope(s);
    setParam("scope", s, "all");
  }

  const signIn = scope === "you" && ready && !userId;
  const loading = !signIn && isLoading && !items.length;

  return (
    <div className="pt-10 sm:pt-14">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            Feed
            {/* On air: calls come in live. */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] font-normal tracking-[0.2em] text-muted uppercase">
              <LiveDot />
              On air
            </span>
          </span>
        }
        backdrop={<SignalField />}
      >
        Every call as it lands, and every call that hits 2x, 5x, 10x and up, each from the caller&apos;s own entry.
      </PageHeader>

      {accountsAvailable && (
        <TabBar label="Callers" options={SCOPE_LABELS} value={scope} onChange={pickScope} className="mt-6" />
      )}

      <div className="mt-4 flex items-center gap-2">
        <Segmented
          label="Kind"
          pressed
          options={KIND_LABELS}
          value={kind}
          onChange={(k) => setParam("kind", k, "all")}
          className="h-9"
          optionClassName="px-2.5 text-xs"
        />
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

      {fresh > 0 && (
        // No height of its own, so it never pushes the list; it stays under the header while you scroll.
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)] z-30 flex h-0 justify-center">
          <button
            type="button"
            onClick={showNew}
            className="animate-fade-in relative mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3.5 text-xs font-medium text-bg shadow-float transition-opacity hover:opacity-85"
          >
            {/* New signal coming in. */}
            <span aria-hidden className="absolute inset-0 -z-10 animate-ping rounded-full bg-fg/40" />
            <ArrowUp className="size-3.5" />
            {fresh} new
          </button>
        </div>
      )}

      <div className="mt-4">
        {signIn ? (
          <Empty
            title="Sign in to see your calls"
            body={
              <>
                Your calls and the milestones they reach show up here.{" "}
                <Link href={loginHref("/feed?scope=you")} className="text-fg underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </>
            }
          />
        ) : loading ? (
          <div className="card">
            <ListSkeleton rows={8} />
          </div>
        ) : !shown.length ? (
          <Empty
            title="Nothing here yet"
            body={
              kind !== "all" || chain !== "all"
                ? "Try another kind or chain."
                : scope === "you"
                  ? "Paste a CA: your calls and the milestones they reach show up here."
                  : "Calls show up here the moment someone pastes a CA."
            }
          />
        ) : (
          <>
            <div className="space-y-6">
              {byDay(shown, now).map((day) => (
                <section key={day.label} aria-label={day.label}>
                  <h2 className="label mb-2 text-subtle">{day.label}</h2>
                  <Cascade className="divide-y divide-border overflow-hidden card">
                    {day.items.map((item) => (
                      <FeedRow key={item.id} item={item} />
                    ))}
                  </Cascade>
                </section>
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
