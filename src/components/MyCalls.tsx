"use client";

import clsx from "clsx";
import { ClipboardPaste, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { formatMultiple, formatUsd, tokenHref } from "@/lib/format";
import { removeMyCall, useMyCalls, useTokens, type MyCall } from "@/lib/hooks";
import { MAX_LIMIT } from "@/lib/params";
import { ratio, tierOf } from "@/lib/metrics";
import { apiFetch, authedFetcher } from "@/lib/supabase-browser";
import type { CallView, MyCallsResponse, TokenView } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { MultipleBadge, toneOf } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ChainTag } from "./Chain";
import { ListSkeleton, TokenName } from "./TokenList";

type Row = {
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
  /** "account": verified and synced; "device": this browser only. */
  source: "account" | "device";
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
    source: "device",
  };
}

function accountRow(c: CallView): Row {
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
    source: "account",
  };
}

export function MyCalls() {
  const { userId, handle, available } = useAuth();
  const deviceCalls = useMyCalls();
  // Live data for the calls on this device (the newest MAX_LIMIT of them).
  const { tokens, isLoading } = useTokens({ ids: deviceCalls.slice(0, MAX_LIMIT).map((c) => c.id), limit: MAX_LIMIT });
  const account = useSWR<MyCallsResponse>(userId ? `/api/me/calls?u=${userId}` : null, authedFetcher, {
    refreshInterval: 20_000,
    keepPreviousData: true,
  });
  const [sort, setSort] = useState<keyof typeof SORTS>("new");

  const rows = useMemo(() => {
    const synced = (account.data?.calls ?? []).map(accountRow);
    const syncedIds = new Set(synced.map((r) => r.id));
    const byId = new Map(tokens.map((t) => [t.id, t]));
    const local = deviceCalls.filter((c) => !syncedIds.has(c.id)).map((c) => deviceRow(c, byId.get(c.id)));
    return [...synced, ...local].sort(SORTS[sort]);
  }, [account.data, deviceCalls, tokens, sort]);

  async function remove(row: Row) {
    removeMyCall(row.id);
    if (row.source === "account") {
      await apiFetch(`/api/me/calls?token=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      void account.mutate();
    }
  }

  const withData = rows.filter((r) => r.token);
  const inProfit = withData.filter((r) => ["up", "pump", "moon"].includes(tierOf(r.multiple))).length;
  const doubled = withData.filter((r) => r.multiple >= 2).length;
  const best = withData.reduce<Row | null>((acc, r) => (!acc || r.multiple > acc.multiple ? r : acc), null);
  const loading = (isLoading && deviceCalls.length > 0) || (!!userId && account.isLoading);

  return (
    <div className="pt-10 sm:pt-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My calls</h1>
      <p className="mt-1.5 text-sm text-muted">
        Measured from the moment <em>you</em> pasted.{" "}
        {handle ? (
          <span className="text-subtle">
            Recorded on Rankr as <span className="font-mono">{handle}</span> and counted on the caller board.
          </span>
        ) : available ? (
          <span className="text-subtle">Your first paste gets you an anonymous id on the caller board. No sign-up.</span>
        ) : (
          <span className="text-subtle">Saved on this device.</span>
        )}
      </p>

      {!rows.length ? (
        loading ? (
          <div className="mt-8 rounded-lg border border-border">
            <ListSkeleton rows={4} />
          </div>
        ) : (
        <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <ClipboardPaste className="mx-auto size-5 text-subtle" />
          <p className="mt-3 font-medium">No calls yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Paste a CA and it lands here, tracked from your entry.</p>
          <Link
            href="/#paste"
            className="mt-5 inline-flex h-9 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-85"
          >
            Paste a CA
          </Link>
        </div>
        )
      ) : (
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
            <h2 className="text-sm font-medium">{rows.length} tokens</h2>
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
                  <div className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <TokenName symbol={row.symbol} name={row.name} className="min-w-0" />
                      {handle && row.source === "device" && (
                        <span
                          className="shrink-0 rounded border border-border px-1 font-mono text-[10px] text-subtle"
                          title="Pasted before you had an id. Kept on this device, not on the caller board."
                        >
                          device
                        </span>
                      )}
                    </span>
                    <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
                      <ChainTag chainId={row.chainId} /> · you {formatUsd(row.entryMarketCap)} → {formatUsd(row.marketCap)} ·{" "}
                      <TimeAgo at={row.calledAt} />
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
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-subtle transition hover:text-down sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  aria-label={`Remove $${row.symbol} from my calls`}
                  title="Remove from my calls"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
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
