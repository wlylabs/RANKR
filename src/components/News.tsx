"use client";

import clsx from "clsx";
import { ArrowUpRight, ChevronDown, ChevronRight, Coins, Newspaper } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatPercent, formatUsd, shortAddress, tokenHref } from "@/lib/format";
import { useNamesakes, useNews } from "@/lib/hooks";
import type { NamesakesResponse, NewsItem } from "@/lib/types";
import { ChainTag } from "./Chain";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ListSkeleton, TokenName } from "./TokenList";

/** One of a story's namesakes: who it is (chain, address, age) and its market, linking to its page on Rankr. */
function Namesake({ market: m, multiple }: NamesakesResponse["items"][number]) {
  return (
    <Link href={tokenHref(m)} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <TokenName symbol={m.symbol} name={m.name} className="min-w-0" />
        <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
          <ChainTag chainId={m.chainId} /> · {shortAddress(m.address)}
          {m.pairCreatedAt && (
            <>
              {" "}
              · <TimeAgo at={m.pairCreatedAt} compact /> old
            </>
          )}
        </div>
        {/* Wraps rather than cuts: these are the numbers to pick by. */}
        <div className="tabular mt-0.5 font-mono text-[11px] text-muted">
          mc {formatUsd(m.marketCap ?? m.fdv)} · vol {formatUsd(m.volume24h)} · liq {formatUsd(m.liquidityUsd)} · 24h{" "}
          <span className={clsx((m.priceChange24h ?? 0) > 0 ? "text-up" : (m.priceChange24h ?? 0) < 0 && "text-down")}>
            {formatPercent(m.priceChange24h)}
          </span>
        </div>
      </div>
      {multiple !== null ? (
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <MultipleBadge multiple={multiple} size="sm" />
          <span className="font-mono text-[10px] text-subtle">on Rankr</span>
        </span>
      ) : (
        <ChevronRight className="size-4 shrink-0 text-subtle" />
      )}
    </Link>
  );
}

/** Every token named like the story's token: many share a ticker, so the reader picks by the numbers. */
function Namesakes({ token }: { token: NewsItem["token"] }) {
  const { items, error, isLoading } = useNamesakes(token.name, token.symbol);
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border bg-surface">
      <p className="border-b border-border px-3 py-2 font-mono text-[11px] text-subtle">
        tokens named &ldquo;{token.name}&rdquo; or ${token.symbol} · most liquid first
      </p>
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : error && !items.length ? (
        <p className="px-3 py-4 text-sm text-down">Couldn&apos;t load the tokens. Try again in a moment.</p>
      ) : !items.length ? (
        <p className="px-3 py-4 text-sm text-muted">No token named like this on DexScreener yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {items.map((n) => (
            <Namesake key={`${n.market.chainId}:${n.market.address}`} {...n} />
          ))}
        </div>
      )}
      <p className="border-t border-border px-3 py-2 font-mono text-[11px] text-subtle">
        same ticker, different token: check the chain and address before you buy
      </p>
    </div>
  );
}

function Headline({ item }: { item: NewsItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-4 py-3">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[15px] leading-snug font-medium text-pretty text-fg hover:underline"
      >
        {item.title}
        <ArrowUpRight className="ml-1 inline size-3.5 align-[-2px] text-subtle" aria-hidden />
      </a>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[11px] text-subtle">
        {item.source && (
          <>
            <span>{item.source}</span>
            <span>·</span>
          </>
        )}
        <TimeAgo at={item.publishedAt} compact />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={clsx(
            "ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 font-sans text-xs transition-colors hover:bg-surface-2 hover:text-fg",
            open ? "bg-surface-2 text-fg" : "text-muted",
          )}
        >
          <Coins className="size-3.5" />
          Tokens · ${item.token.symbol}
          <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && <Namesakes token={item.token} />}
    </li>
  );
}

/** Headlines that name the tokens on Rankr, newest first: a headline and a link, nothing more. */
export function News() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const token = params.get("token");
  // All tokens: what to pick from. One token: its own headlines (and its name, if it isn't among them).
  const all = useNews(null);
  const picked = useNews(token);
  const { items, isLoading } = token ? picked : all;

  const named = new Set(all.items.map((n) => n.token.id));
  const options = all.tokens.filter((t) => named.has(t.id) || t.id === token);
  const current = picked.tokens.find((t) => t.id === token);
  if (current && !options.some((t) => t.id === current.id)) options.unshift(current);

  function pick(id: string) {
    router.replace(id === "all" ? pathname : `${pathname}?token=${encodeURIComponent(id)}`, { scroll: false });
  }

  return (
    <div className="pt-10 sm:pt-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">News</h1>
      <p className="mt-1.5 text-sm text-muted">Headlines that name the tokens on Rankr. Pick a token to see only its own.</p>

      <div className="relative mt-6 sm:w-72">
        <select
          value={token ?? "all"}
          onChange={(e) => pick(e.target.value)}
          aria-label="Token"
          className="h-9 w-full cursor-pointer appearance-none rounded-md border border-border bg-bg pr-8 pl-3 text-sm text-fg outline-none transition-colors hover:bg-surface-2 focus-visible:border-border-strong"
        >
          <option value="all">All tokens</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              ${t.symbol} · {t.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-subtle" />
      </div>

      <div className="mt-4">
        {isLoading && !items.length ? (
          <div className="rounded-lg border border-border">
            <ListSkeleton rows={6} />
          </div>
        ) : !items.length ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
            <Newspaper className="mx-auto size-5 text-subtle" />
            <p className="mt-3 font-medium">No headlines yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              {current
                ? `Nothing in the news names $${current.symbol} yet.`
                : "Nothing in the news names the tokens on the board yet."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items.map((item) => (
              <Headline key={item.id} item={item} />
            ))}
          </ul>
        )}
        <p className="mt-3 font-mono text-[11px] text-subtle">
          headlines from Google News, matched by the token&apos;s name or $ticker · each opens the article
        </p>
      </div>
    </div>
  );
}
