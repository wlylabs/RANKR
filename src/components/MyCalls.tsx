"use client";

import clsx from "clsx";
import { ChevronRight, ClipboardPaste, Globe, Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { callerStats } from "@/lib/caller-stats";
import { callerHref, formatMultiple, formatUsd, tokenHref } from "@/lib/format";
import { useAccountCalls, useMyCalls, useMyRank, useTokens, type MyCall } from "@/lib/hooks";
import { loginHref } from "@/lib/login";
import { MAX_LIMIT } from "@/lib/params";
import { ratio, tierOf } from "@/lib/metrics";
import { nextResetAt, resetDay } from "@/lib/season";
import { accountsAvailable } from "@/lib/supabase-browser";
import type { CallView, CallerAbout, TokenView } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { CallSpread, RecentForm } from "./CallerCharts";
import { rankLine } from "./CallersBoard";
import { MultipleBadge, toneOf } from "./MultipleBadge";
import { PROFILE_ACTION, ProfileHeader } from "./ProfileHeader";
import { TimeAgo } from "./TimeAgo";
import { ChainTag } from "./Chain";
import { Watchlist } from "./Watchlist";
import { useWatchlist } from "@/lib/watchlist";
import { ListSkeleton, TokenName } from "./TokenList";

export type Row = {
  id: string;
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  entryMarketCap: number | null;
  calledAt: number;
  multiple: number;
  marketCap: number | null;
  token: TokenView | undefined;
};

const SORTS = {
  new: (a: Row, b: Row) => b.calledAt - a.calledAt,
  best: (a: Row, b: Row) => b.multiple - a.multiple,
  worst: (a: Row, b: Row) => a.multiple - b.multiple,
};

function deviceRow(call: MyCall, token: TokenView | undefined): Row {
  const price = token?.market?.priceUsd;
  return {
    id: call.id,
    chainId: call.chainId,
    address: call.address,
    symbol: call.symbol,
    name: call.name,
    entryMarketCap: call.entryMarketCap,
    calledAt: call.pastedAt,
    multiple: price ? ratio(price, call.entryPriceUsd) : 1,
    marketCap: token?.marketCap ?? null,
    token,
  };
}

/** A call from the server (yours or a caller's) as a list row. */
export function callRow(c: CallView): Row {
  const t = c.token;
  return {
    id: t.id,
    chainId: t.chainId,
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    entryMarketCap: c.entryMarketCap,
    calledAt: c.calledAt,
    multiple: c.multiple,
    marketCap: t.marketCap,
    token: t,
  };
}

export function MyCalls() {
  const { available, ready, userId, username, hasKey, official, about } = useAuth();
  if (!available) return <DeviceCalls />;
  if (!ready) return <Page rows={[]} loading />;
  if (!userId || !username) {
    return (
      <Page rows={[]}>
        <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <UserRound className="mx-auto size-5 text-subtle" />
          <p className="mt-3 font-medium">{userId ? "Pick a name" : "Sign in to see your calls"}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            {userId
              ? "Your calls show up on the caller board under it."
              : "Every CA you paste is your call, tracked from your own entry and ranked on the caller board. Continue as a guest in one click, or sign in with your key."}
          </p>
          <Link
            href={loginHref("/me")}
            className="mt-5 inline-flex h-9 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-85"
          >
            {userId ? "Pick a name" : "Sign in"}
          </Link>
        </div>
      </Page>
    );
  }
  return <AccountCalls userId={userId} username={username} hasKey={hasKey} official={official} about={about} />;
}

function AccountCalls({
  userId,
  username,
  hasKey,
  official,
  about,
}: {
  userId: string;
  username: string;
  hasKey: boolean;
  official: boolean;
  about: CallerAbout | null;
}) {
  const { data, isLoading } = useAccountCalls(userId);
  const calls = useMemo(() => data?.calls ?? [], [data]);
  const rows = useMemo(() => calls.map(callRow), [calls]);

  return (
    <Page
      header={
        <>
          {/* Who you are, as on your public page, and your place on the caller board. */}
          <ProfileHeader
            userId={userId}
            username={username}
            official={official}
            stats={calls.length ? callerStats(calls) : null}
            since={calls.length ? Math.min(...calls.map((c) => c.calledAt)) : null}
            about={about}
            actions={
              <>
                <Link href={callerHref(username)} className={PROFILE_ACTION} title="Your public page">
                  <Globe className="size-3.5" />
                  <span className="max-sm:sr-only">Public page</span>
                </Link>
                <Link href="/account" className={PROFILE_ACTION} title="Edit profile">
                  <Pencil className="size-3.5" />
                  <span className="max-sm:sr-only">Edit profile</span>
                </Link>
              </>
            }
          />
          <RankCard userId={userId} className="mt-6" />
        </>
      }
      intro={
        !hasKey && (
          <>
            Guest account, this browser only:{" "}
            <Link href="/account" className="text-fg underline-offset-4 hover:underline">
              save your key to keep it
            </Link>
            .
          </>
        )
      }
      rows={rows}
      loading={isLoading}
    />
  );
}

/**
 * Your place on the caller board (by hit rate, its default) as a link, to the board unless `href` says
 * otherwise. `best` adds your best call.
 */
export function RankCard({
  userId,
  href = "/leaderboard?view=callers",
  best = false,
  className,
}: {
  userId: string;
  href?: string;
  best?: boolean;
  className?: string;
}) {
  const mine = useMyRank("rate", userId);
  if (!mine) return null;
  const bestCall =
    best && mine.caller?.bestToken ? `best $${mine.caller.bestToken.symbol} ${formatMultiple(mine.caller.bestMultiple)}` : null;
  const line = [rankLine("rate", mine), bestCall].filter(Boolean).join(" · ");
  return (
    <Link
      href={href}
      className={clsx("flex items-center gap-4 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-surface-2", className)}
    >
      <span className="tabular font-mono text-2xl font-medium tracking-tight">{mine.rank ? `#${mine.rank}` : "—"}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">
          {mine.rank ? `of ${mine.total} on the caller board` : "Not on the caller board yet"}
          <span className="text-subtle"> · hit rate</span>
        </span>
        {line && <span className="mt-0.5 block truncate font-mono text-[11px] text-subtle">{line}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-subtle" />
    </Link>
  );
}

/** Without accounts (local dev): the calls pasted from this browser. */
function DeviceCalls() {
  const calls = useMyCalls();
  // Live data for the calls on this device (the newest MAX_LIMIT of them).
  const { tokens, isLoading } = useTokens({ ids: calls.slice(0, MAX_LIMIT).map((c) => c.id), limit: MAX_LIMIT });
  const rows = useMemo(() => {
    const byId = new Map(tokens.map((t) => [t.id, t]));
    return calls.map((c) => deviceRow(c, byId.get(c.id)));
  }, [calls, tokens]);
  return <Page intro="Saved on this device." rows={rows} loading={isLoading && calls.length > 0} />;
}

const TABS = { calls: "Calls", stats: "Stats", watchlist: "Watchlist" } as const;
type TabKey = keyof typeof TABS;

/** The tab in the URL (?tab=stats), so it survives a reload and can be linked to. */
function useTab(): [TabKey, (tab: TabKey) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const picked = params.get("tab");
  const tab: TabKey = picked === "stats" || picked === "watchlist" ? picked : "calls";
  // Old links: /me#watchlist.
  useEffect(() => {
    if (window.location.hash === "#watchlist") router.replace(`${pathname}?tab=watchlist`, { scroll: false });
  }, [pathname, router]);
  return [tab, (next) => router.replace(next === "calls" ? pathname : `${pathname}?tab=${next}`, { scroll: false })];
}

/** "You": your calls, how they're doing, and your watchlist. */
function Page({
  header,
  intro,
  rows,
  loading = false,
  children,
}: {
  /** Above the tabs; a plain "You" heading when there's no account to show. */
  header?: React.ReactNode;
  intro?: React.ReactNode;
  rows: Row[];
  loading?: boolean;
  /** Shown instead of the calls and the stats (e.g. "Sign in"). */
  children?: React.ReactNode;
}) {
  const watching = useWatchlist().length;
  const [tab, setTab] = useTab();

  return (
    <div className="pt-10 sm:pt-14">
      {header ?? <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">You</h1>}
      <div className="mt-6 flex border-b border-border" role="tablist" aria-label="You">
        {(Object.keys(TABS) as TabKey[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              "relative mr-6 h-10 text-sm transition-colors",
              tab === t ? "text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-fg" : "text-muted hover:text-fg",
            )}
          >
            {TABS[t]}
            {t === "watchlist" && watching > 0 && <span className="ml-1.5 font-mono text-xs text-subtle">{watching}</span>}
          </button>
        ))}
      </div>

      {tab === "watchlist" ? (
        <Watchlist />
      ) : children ? (
        children
      ) : tab === "stats" ? (
        <Stats rows={rows} loading={loading} />
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            Measured from the moment <em>you</em> pasted. {intro && <span className="text-subtle">{intro}</span>}
            {accountsAvailable && (
              <span className="text-subtle"> Calls reset with the boards on {resetDay(nextResetAt())}, 00:00 UTC.</span>
            )}
          </p>
          {!rows.length && !loading ? <NoCalls /> : <CallsView rows={rows} loading={loading} />}
        </>
      )}
    </div>
  );
}

function NoCalls() {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <ClipboardPaste className="mx-auto size-5 text-subtle" />
      <p className="mt-3 font-medium">No calls yet</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Paste a CA and it lands here, tracked from your entry.</p>
      <Link
        href="/app#paste"
        className="mt-5 inline-flex h-9 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-85"
      >
        Paste a CA
      </Link>
    </div>
  );
}

/** Where your calls are now and your last 10, the charts of your public page. */
function Stats({ rows, loading }: { rows: Row[]; loading: boolean }) {
  if (!rows.length) {
    return loading ? (
      <div className="mt-8 rounded-lg border border-border">
        <ListSkeleton rows={4} />
      </div>
    ) : (
      <NoCalls />
    );
  }
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      <CallSpread rows={rows} />
      <RecentForm rows={rows} />
    </div>
  );
}

/**
 * Summary tiles, a sort switch and the list of calls, each measured from the caller's own entry.
 * Used by My calls and by public caller profiles. Calls can't be removed: they all go with the monthly reset.
 */
export function CallsView({ rows: unsorted, loading = false }: { rows: Row[]; loading?: boolean }) {
  const [sort, setSort] = useState<keyof typeof SORTS>("new");
  const rows = useMemo(() => [...unsorted].sort(SORTS[sort]), [unsorted, sort]);
  const withData = rows.filter((r) => r.token);
  const inProfit = withData.filter((r) => ["up", "pump", "moon"].includes(tierOf(r.multiple))).length;
  const doubled = withData.filter((r) => r.multiple >= 2).length;
  const best = withData.reduce<Row | null>((acc, r) => (!acc || r.multiple > acc.multiple ? r : acc), null);

  if (!rows.length) {
    return (
      <div className="mt-8 rounded-lg border border-border">
        <ListSkeleton rows={4} />
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 grid grid-cols-2 rounded-lg border border-border max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(even)]:border-l lg:grid-cols-4 lg:divide-x lg:divide-border">
        <Tile label="Calls" value={rows.length} />
        <Tile
          label="In profit"
          value={withData.length ? `${Math.round((inProfit / withData.length) * 100)}%` : "—"}
          hint={`${inProfit} of ${withData.length}`}
        />
        <Tile label="2x or better" value={doubled} hint="right now" />
        <Tile
          label="Best call"
          value={best ? <span className={toneOf(best.multiple, "text-fg")}>{formatMultiple(best.multiple)}</span> : "—"}
          hint={best ? `$${best.symbol}` : undefined}
        />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {rows.length} {rows.length === 1 ? "token" : "tokens"}
        </h2>
        <div className="flex h-8 items-center rounded-md border border-border p-0.5">
          {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              aria-pressed={sort === key}
              className={clsx(
                "h-full rounded px-2.5 text-xs capitalize transition-colors",
                sort === key ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg",
              )}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {rows.map((row) => (
          <li key={row.id} className="transition-colors hover:bg-surface-2">
            <Link href={tokenHref(row)} className="flex min-w-0 items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <TokenName symbol={row.symbol} name={row.name} className="min-w-0" />
                <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
                  <ChainTag chainId={row.chainId} /> · entry {formatUsd(row.entryMarketCap)} ·{" "}
                  <TimeAgo at={row.calledAt} compact />
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                {row.token ? (
                  <MultipleBadge multiple={row.multiple} />
                ) : (
                  <span className="font-mono text-xs text-subtle">{loading ? "…" : "no data"}</span>
                )}
                {row.token && row.token.firstPastedAt < row.calledAt - 60_000 && (
                  <span className="tabular hidden font-mono text-[11px] text-subtle sm:block">
                    rankr {formatMultiple(row.token.multiple)}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border-border px-4 py-5 sm:px-6">
      <div className="label text-subtle">{label}</div>
      <div className="tabular mt-2 font-mono text-2xl font-medium tracking-tight sm:text-3xl">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}
