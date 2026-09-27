"use client";

import clsx from "clsx";
import { ClipboardPaste, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatMultiple, formatUsd, tokenHref } from "@/lib/format";
import { refreshBoards, removeMyCall, useAccountCalls, useMyCalls, useTokens, type MyCall } from "@/lib/hooks";
import { loginHref } from "@/lib/login";
import { MAX_LIMIT } from "@/lib/params";
import { ratio, tierOf } from "@/lib/metrics";
import { apiFetch } from "@/lib/supabase-browser";
import type { CallView, TokenView } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { OfficialBadge } from "./OfficialBadge";
import { MultipleBadge, toneOf } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ChainTag } from "./Chain";
import { TokenIcon } from "./TokenIcon";
import { Watchlist } from "./Watchlist";
import { useWatchlist } from "@/lib/watchlist";
import { ListSkeleton, TokenName } from "./TokenList";

export type Row = {
  id: string;
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
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
    imageUrl: token?.imageUrl ?? call.imageUrl,
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
    imageUrl: t.imageUrl,
    entryMarketCap: c.entryMarketCap,
    calledAt: c.calledAt,
    multiple: c.multiple,
    marketCap: t.marketCap,
    token: t,
  };
}

export function MyCalls() {
  const { available, ready, userId, username, hasKey, official } = useAuth();
  if (!available) return <DeviceCalls />;
  if (!ready) return <Page intro={null} rows={[]} loading />;
  if (!userId || !username) {
    return (
      <Page intro={null} rows={[]}>
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
  return <AccountCalls userId={userId} username={username} hasKey={hasKey} official={official} />;
}

function AccountCalls({
  userId,
  username,
  hasKey,
  official,
}: {
  userId: string;
  username: string;
  hasKey: boolean;
  official: boolean;
}) {
  const { data, isLoading, mutate } = useAccountCalls(userId);
  const rows = useMemo(() => (data?.calls ?? []).map(callRow), [data]);

  async function remove(row: Row) {
    await mutate((cur) => cur && { calls: cur.calls.filter((c) => c.tokenId !== row.id) }, { revalidate: false });
    await apiFetch(`/api/me/calls?token=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    void refreshBoards();
  }

  return (
    <Page
      intro={
        <>
          Recorded as <span className="font-mono text-fg">@{username}</span>
          {official && <OfficialBadge className="ml-1" />} and ranked on the caller board.
          {!hasKey && (
            <>
              {" "}
              Guest account, this browser only:{" "}
              <Link href="/account" className="text-fg underline-offset-4 hover:underline">
                save your key to keep it
              </Link>
              .
            </>
          )}
        </>
      }
      rows={rows}
      loading={isLoading}
      onRemove={remove}
    />
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
  return (
    <Page
      intro="Saved on this device."
      rows={rows}
      loading={isLoading && calls.length > 0}
      onRemove={(row) => removeMyCall(row.id)}
    />
  );
}

function Page({
  intro,
  rows,
  loading = false,
  onRemove,
  children,
}: {
  intro: React.ReactNode;
  rows: Row[];
  loading?: boolean;
  onRemove?: (row: Row) => void;
  children?: React.ReactNode;
}) {
  const watching = useWatchlist().length;
  const [tab, setTab] = useState<"calls" | "watchlist">("calls");
  // /me#watchlist opens the watchlist.
  useEffect(() => {
    if (window.location.hash === "#watchlist") setTab("watchlist");
  }, []);

  return (
    <div className="pt-10 sm:pt-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My calls</h1>
      <div className="mt-4 flex border-b border-border" role="tablist" aria-label="My calls">
        {(["calls", "watchlist"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              history.replaceState(null, "", t === "watchlist" ? "#watchlist" : location.pathname);
            }}
            className={clsx(
              "relative mr-6 h-10 text-sm capitalize transition-colors",
              tab === t ? "text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-fg" : "text-muted hover:text-fg",
            )}
          >
            {t}
            {t === "watchlist" && watching > 0 && <span className="ml-1.5 font-mono text-xs text-subtle">{watching}</span>}
          </button>
        ))}
      </div>

      {tab === "watchlist" ? (
        <Watchlist />
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            Measured from the moment <em>you</em> pasted. {intro && <span className="text-subtle">{intro}</span>}
          </p>

          {children ?? (!rows.length && !loading ? (
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
          ) : (
            <CallsView rows={rows} loading={loading} onRemove={onRemove} />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Summary tiles, a sort switch and the list of calls, each measured from the caller's own entry.
 * Used by My calls and by public caller profiles.
 */
export function CallsView({
  rows: unsorted,
  loading = false,
  onRemove,
}: {
  rows: Row[];
  loading?: boolean;
  onRemove?: (row: Row) => void;
}) {
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
          <li key={row.id} className="group flex items-center gap-2 pr-2 transition-colors hover:bg-surface-2">
            <Link href={tokenHref(row)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4">
              <TokenIcon src={row.imageUrl} symbol={row.symbol} size={32} />
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
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(row)}
                className="grid size-8 shrink-0 place-items-center rounded-md text-subtle transition hover:text-down sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                aria-label={`Remove $${row.symbol} from my calls`}
                title="Remove from my calls"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
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
