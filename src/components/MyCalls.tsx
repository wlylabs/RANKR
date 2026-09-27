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
import { ChainTag } from "./Chain";
import { TokenName } from "./TokenList";

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
    <div className="pt-10 sm:pt-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My calls</h1>
      <p className="mt-1.5 text-sm text-muted">
        Measured from the moment <em>you</em> pasted. <span className="text-subtle">Saved on this device.</span>
      </p>

      {!calls.length ? (
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
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 rounded-lg border border-border max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(even)]:border-l lg:grid-cols-4 lg:divide-x lg:divide-border">
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

          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-sm font-medium">{calls.length} tokens</h2>
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
            {rows.map(({ call, token, multiple, marketCap }) => (
              <li key={call.id} className="group flex items-center gap-2 pr-2 transition-colors hover:bg-surface-2">
                <Link href={tokenHref(call)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4">
                  <div className="min-w-0 flex-1">
                    <TokenName symbol={call.symbol} name={call.name} />
                    <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
                      <ChainTag chainId={call.chainId} /> · you {formatUsd(call.entryMarketCap)} → {formatUsd(marketCap)} ·{" "}
                      <TimeAgo at={call.pastedAt} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {token ? (
                      <MultipleBadge multiple={multiple} />
                    ) : (
                      <span className="font-mono text-xs text-subtle">{isLoading ? "…" : "no data"}</span>
                    )}
                    {token && token.firstPastedAt < call.pastedAt - 60_000 && (
                      <span className="tabular hidden font-mono text-[11px] text-subtle sm:block">
                        rankr {formatMultiple(token.multiple)}
                      </span>
                    )}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => removeMyCall(call.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-subtle transition hover:text-down sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  aria-label={`Remove $${call.symbol} from my calls`}
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
