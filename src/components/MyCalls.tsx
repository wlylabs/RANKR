"use client";

import clsx from "clsx";
import { ClipboardPaste, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMultiple, formatUsd, tokenHref } from "@/lib/format";
import { removeMyCall, useMyCalls, useTokens, type MyCall } from "@/lib/hooks";
import { ratio } from "@/lib/metrics";
import type { TokenView } from "@/lib/types";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ChainBadge, TokenAvatar } from "./TokenAvatar";

type Row = { call: MyCall; token: TokenView | undefined; multiple: number; marketCap: number | null };

const SORTS = {
  new: (a: Row, b: Row) => b.call.pastedAt - a.call.pastedAt,
  best: (a: Row, b: Row) => b.multiple - a.multiple,
  worst: (a: Row, b: Row) => a.multiple - b.multiple,
};

export function MyCalls() {
  const calls = useMyCalls();
  const { tokens, isLoading } = useTokens();
  const [sort, setSort] = useState<keyof typeof SORTS>("new");

  const rows = useMemo(() => {
    const byId = new Map(tokens.map((t) => [t.id, t]));
    return calls
      .map((call): Row => {
        const token = byId.get(call.id);
        const price = token?.market?.priceUsd;
        const multiple = price ? ratio(price, call.entryPriceUsd) : 1;
        return { call, token, multiple, marketCap: token?.marketCap ?? null };
      })
      .sort(SORTS[sort]);
  }, [calls, tokens, sort]);

  const withData = rows.filter((r) => r.token);
  const inProfit = withData.filter((r) => r.multiple >= 1).length;
  const doubled = withData.filter((r) => r.multiple >= 2).length;
  const best = withData.reduce<Row | null>((acc, r) => (!acc || r.multiple > acc.multiple ? r : acc), null);

  return (
    <div className="pt-6 sm:pt-10">
      <h1 className="font-pixel text-4xl sm:text-5xl">My calls</h1>
      <p className="mt-2 text-sm text-muted">
        Measured from the moment <em>you</em> pasted. <span className="text-subtle">Saved on this device.</span>
      </p>

      {!calls.length ? (
        <div className="mt-6 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-lg border border-border bg-surface-2">
            <ClipboardPaste className="size-5" />
          </span>
          <p className="mt-4 font-semibold">No calls yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            Paste a CA and it lands here, tracked from your entry.
          </p>
          <Link
            href="/#paste"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg hover:brightness-110"
          >
            Paste a CA
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
            <Tile label="Calls" value={calls.length} />
            <Tile
              label="In profit"
              value={withData.length ? `${Math.round((inProfit / withData.length) * 100)}%` : "—"}
              hint={`${inProfit} of ${withData.length}`}
            />
            <Tile label="2x or better" value={doubled} hint="right now" />
            <Tile
              label="Best call"
              value={best ? <span className={best.multiple >= 1 ? "text-up" : "text-down"}>{formatMultiple(best.multiple)}</span> : "—"}
              hint={best ? `$${best.call.symbol}` : undefined}
            />
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h2 className="label text-muted">{calls.length} tokens</h2>
            <div className="flex rounded-lg border border-border bg-surface p-1">
              {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  aria-pressed={sort === key}
                  className={clsx(
                    "h-7 rounded-md px-2.5 font-mono text-[11px] uppercase transition-colors",
                    sort === key ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg",
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          <ul className="mt-3 divide-y divide-border/70 rounded-xl border border-border bg-surface">
            {rows.map(({ call, token, multiple, marketCap }) => (
              <li key={call.id} className="group flex items-center gap-3 px-3 py-3 sm:px-4">
                <Link href={tokenHref(call)} className="flex min-w-0 flex-1 items-center gap-3">
                  <TokenAvatar
                    symbol={call.symbol}
                    imageUrl={token?.imageUrl ?? call.imageUrl}
                    chainId={call.chainId}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">${call.symbol}</span>
                      <ChainBadge chainId={call.chainId} />
                    </div>
                    <div className="tabular mt-0.5 truncate font-mono text-[11px] text-muted">
                      You: {formatUsd(call.entryMarketCap)} → {formatUsd(marketCap)}
                      <span className="text-subtle">
                        {" · "}
                        <TimeAgo at={call.pastedAt} />
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {token ? (
                      <MultipleBadge multiple={multiple} />
                    ) : (
                      <span className="text-xs text-subtle">{isLoading ? "…" : "no data"}</span>
                    )}
                    {token && token.firstPastedAt < call.pastedAt - 60_000 && (
                      <span className="tabular hidden font-mono text-[11px] text-subtle sm:block">
                        Rankr: {formatMultiple(token.multiple)}
                      </span>
                    )}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => removeMyCall(call.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-subtle transition hover:bg-down-soft hover:text-down sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  aria-label={`Remove $${call.symbol} from my calls`}
                  title="Remove from my calls"
                >
                  <Trash2 className="size-4" />
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
    <div className="bg-surface p-4 sm:p-5">
      <div className="label text-subtle">{label}</div>
      <div className="tabular mt-2 font-pixel text-3xl leading-none sm:text-4xl">{value}</div>
      {hint && <div className="mt-2 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}
