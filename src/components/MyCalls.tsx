"use client";

import clsx from "clsx";
import { ClipboardPaste, Globe, Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { callerStats } from "@/lib/caller-stats";
import { callerHref, formatMultiple, formatUsd, tokenHref } from "@/lib/format";
import { useAccountCalls, useMounted, useMyCalls, useTokens, type MyCall } from "@/lib/hooks";
import { loginHref } from "@/lib/login";
import { ratio, tierOf } from "@/lib/metrics";
import { nextResetAt, resetDay } from "@/lib/reset";
import { accountsAvailable } from "@/lib/supabase-browser";
import type { CallView, CallerAbout, TokenView } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { IdentityField } from "./Backdrops";
import { CallSpread, RecentForm } from "./CallerCharts";
import { Cascade } from "./Cinema";
import { CountUp } from "./CountUp";
import { MultipleBadge, toneOf } from "./MultipleBadge";
import { PageHeader } from "./PageHeader";
import { PROFILE_ACTION, ProfileHeader } from "./ProfileHeader";
import { PaperTrades, useOpenPaperTrades } from "./PaperTrades";
import { Recaps } from "./Recaps";
import { SaveAvatar } from "./SaveAvatar";
import { ShareCall } from "./ShareCall";
import { Segmented, TabBar } from "./Tabs";
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
const SORT_LABELS: Record<keyof typeof SORTS, string> = { new: "New", best: "Best", worst: "Worst" };

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
              ? "Your calls show up on your public page under it."
              : "Every CA you paste is your call, tracked from your own entry. Continue as a guest in one click, or sign in with your key."}
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
          {/* Who you are, as on your public page. */}
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
                <SaveAvatar userId={userId} username={username} />
              </>
            }
          />
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
      shareAs={username}
      recapsOf={userId}
    />
  );
}

/** Without accounts (local dev): the calls pasted from this browser. */
function DeviceCalls() {
  const calls = useMyCalls();
  // Live data for the calls on this device (the newest MAX_LIMIT of them).
  const { tokens, isLoading } = useTokens(calls.map((c) => c.id));
  const rows = useMemo(() => {
    const byId = new Map(tokens.map((t) => [t.id, t]));
    return calls.map((c) => deviceRow(c, byId.get(c.id)));
  }, [calls, tokens]);
  return <Page intro="Saved on this device." rows={rows} loading={isLoading && calls.length > 0} />;
}

const TABS = { calls: "Calls", stats: "Stats", recaps: "Recaps", portfolio: "Portfolio", watchlist: "Watchlist" } as const;
type TabKey = keyof typeof TABS;

/** The tab in the URL (?tab=stats), so it survives a reload and can be linked to. */
function useTab(): [TabKey, (tab: TabKey) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const picked = params.get("tab");
  // ?tab=paper: old links to the portfolio.
  const tab: TabKey =
    picked === "paper"
      ? "portfolio"
      : picked === "stats" || picked === "recaps" || picked === "portfolio" || picked === "watchlist"
        ? picked
        : "calls";
  // Old links: /me#watchlist.
  useEffect(() => {
    if (window.location.hash === "#watchlist") router.replace(`${pathname}?tab=watchlist`, { scroll: false });
  }, [pathname, router]);
  return [tab, (next) => router.replace(next === "calls" ? pathname : `${pathname}?tab=${next}`, { scroll: false })];
}

/** "You": your calls, how they're doing, your past months, your portfolio and your watchlist. */
function Page({
  header,
  intro,
  rows,
  loading = false,
  shareAs,
  recapsOf,
  children,
}: {
  /** Above the tabs; a plain "You" heading when there's no account to show. */
  header?: React.ReactNode;
  intro?: React.ReactNode;
  rows: Row[];
  loading?: boolean;
  /** The account the calls are under, so each can be shared (calls on this device only can't). */
  shareAs?: string;
  /** The signed-in account whose monthly recaps get a tab (only with accounts: the reset keeps them). */
  recapsOf?: string;
  /** Shown instead of the calls and the stats (e.g. "Sign in"). */
  children?: React.ReactNode;
}) {
  const watching = useWatchlist().length;
  const paperOpen = useOpenPaperTrades();
  const [picked, setTab] = useTab();
  // The reset day is the visitor's (the page is prerendered): said once mounted.
  const mounted = useMounted();
  // No account, no recaps: a ?tab=recaps link opens the calls.
  const tab = picked === "recaps" && !recapsOf ? "calls" : picked;
  const { userId } = useAuth();

  return (
    <div className="pt-10 sm:pt-14">
      <div className="relative isolate">
        <IdentityField seed={userId ?? "rankr/you"} />
        {header ?? <PageHeader title="You" />}
      </div>
      <TabBar
        label="You"
        options={{
          calls: TABS.calls,
          stats: TABS.stats,
          ...(recapsOf && { recaps: TABS.recaps }),
          portfolio: (
            <>
              {TABS.portfolio}
              {paperOpen > 0 && <span className="ml-1.5 font-mono text-xs text-subtle">{paperOpen}</span>}
            </>
          ),
          watchlist: (
            <>
              {TABS.watchlist}
              {watching > 0 && <span className="ml-1.5 font-mono text-xs text-subtle">{watching}</span>}
            </>
          ),
        }}
        value={tab}
        onChange={setTab}
        className="mt-6"
      />

      {tab === "watchlist" ? (
        <Watchlist />
      ) : tab === "portfolio" ? (
        <PaperTrades />
      ) : tab === "recaps" && recapsOf ? (
        <Recaps userId={recapsOf} />
      ) : children ? (
        children
      ) : tab === "stats" ? (
        <Stats rows={rows} loading={loading} />
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            Measured from the moment <em>you</em> pasted. {intro && <span className="text-subtle">{intro}</span>}
            {accountsAvailable && mounted && (
              <span className="text-subtle">
                {" "}
                Calls are cleared on {resetDay(nextResetAt())}, 00:00 UTC
                {recapsOf && rows.length ? "; your month is kept as a private recap." : "."}
              </span>
            )}
          </p>
          {!rows.length && !loading ? <NoCalls /> : <CallsView rows={rows} loading={loading} shareAs={shareAs} />}
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
      <div className="mt-8 card">
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
export function CallsView({
  rows: unsorted,
  loading = false,
  shareAs,
}: {
  rows: Row[];
  loading?: boolean;
  /** Whose calls these are: each row gets its share card. */
  shareAs?: string;
}) {
  const [sort, setSort] = useState<keyof typeof SORTS>("new");
  const rows = useMemo(() => [...unsorted].sort(SORTS[sort]), [unsorted, sort]);
  const withData = rows.filter((r) => r.token);
  const inProfit = withData.filter((r) => ["up", "pump", "moon"].includes(tierOf(r.multiple))).length;
  const doubled = withData.filter((r) => r.multiple >= 2).length;
  const best = withData.reduce<Row | null>((acc, r) => (!acc || r.multiple > acc.multiple ? r : acc), null);

  if (!rows.length) {
    return (
      <div className="mt-8 card">
        <ListSkeleton rows={4} />
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 grid grid-cols-2 card max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(even)]:border-l lg:grid-cols-4 lg:divide-x lg:divide-border">
        <Tile label="Calls" value={<CountUp value={rows.length} />} />
        <Tile
          label="In profit"
          value={withData.length ? `${Math.round((inProfit / withData.length) * 100)}%` : "—"}
          hint={`${inProfit} of ${withData.length}`}
        />
        <Tile label="2x or better" value={<CountUp value={doubled} />} hint="right now" />
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
        <Segmented label="Sort" pressed options={SORT_LABELS} value={sort} onChange={setSort} optionClassName="px-2.5 text-xs" />
      </div>

      <Cascade as="ul" className="mt-3 divide-y divide-border overflow-hidden card">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center transition-colors hover:bg-surface-2">
            <Link
              href={tokenHref(row)}
              className={clsx("flex min-w-0 flex-1 items-center gap-3 py-3 pl-4", shareAs && row.token ? "pr-1" : "pr-4")}
            >
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
            {shareAs && row.token && (
              <ShareCall
                variant="icon"
                className="mr-2"
                call={{ username: shareAs, token: row, entryMarketCap: row.entryMarketCap, multiple: row.multiple }}
              />
            )}
          </li>
        ))}
      </Cascade>
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
