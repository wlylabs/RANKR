"use client";

import clsx from "clsx";
import { ArrowUpRight, ChevronDown, ChevronRight, Coins, Newspaper, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPercent, formatUsd, shortAddress, tokenHref } from "@/lib/format";
import { useNamesakes, useNews } from "@/lib/hooks";
import type { NamesakesResponse, NewsItem } from "@/lib/types";
import { ChainTag } from "./Chain";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ListSkeleton, TokenName } from "./TokenList";

/** A token named after a story: who it is (chain, address, age) and its market, linking to its page on Rankr. */
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

/**
 * Every token named after a story: pick one of the names in the headline (the likeliest is picked) or type
 * another, then pick a token by its numbers. Many tokens share a name or a ticker.
 */
function Namesakes({ keywords }: { keywords: string[] }) {
  const [keyword, setKeyword] = useState(keywords[0] ?? "");
  const [draft, setDraft] = useState("");
  const { items, error, isLoading } = useNamesakes(keyword);

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        {keywords.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKeyword(k)}
            aria-pressed={keyword === k}
            className={clsx(
              "h-7 rounded-md border px-2.5 text-xs transition-colors",
              keyword === k ? "border-border-strong bg-surface-2 text-fg" : "border-border text-muted hover:text-fg",
            )}
          >
            {k}
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) setKeyword(draft.trim());
          }}
          className="min-w-32 flex-1"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Another name or $ticker"
            maxLength={64}
            aria-label="Search tokens by name"
            className="h-7 w-full rounded-md border border-border bg-bg px-2.5 text-xs outline-none placeholder:text-subtle focus:border-border-strong"
          />
        </form>
      </div>
      {!keyword ? (
        <p className="px-3 py-4 text-sm text-muted">Type a name to see the tokens named after it.</p>
      ) : (
        <>
          <p className="px-3 pt-2 font-mono text-[11px] text-subtle">tokens named &ldquo;{keyword}&rdquo; · most liquid first</p>
          {isLoading ? (
            <ListSkeleton rows={3} />
          ) : error && !items.length ? (
            <p className="px-3 py-4 text-sm text-down">Couldn&apos;t load the tokens. Try again in a moment.</p>
          ) : !items.length ? (
            <p className="px-3 py-4 text-sm text-muted">No token named like this on DexScreener yet.</p>
          ) : (
            <div className="mt-1 divide-y divide-border">
              {items.map((n) => (
                <Namesake key={`${n.market.chainId}:${n.market.address}`} {...n} />
              ))}
            </div>
          )}
        </>
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
            "ml-auto inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border px-2.5 font-sans text-xs transition-colors hover:bg-surface-2 hover:text-fg",
            open ? "bg-surface-2 text-fg" : "text-muted",
          )}
        >
          <Coins className="size-3.5 shrink-0" />
          <span className="truncate">Tokens{item.keywords[0] && ` · ${item.keywords[0]}`}</span>
          <ChevronDown className={clsx("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && <Namesakes keywords={item.keywords} />}
    </li>
  );
}

/** What's in the news right now, newest first, or a search: a headline and a link, and the tokens named after it. */
export function News() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = params.get("q") ?? "";
  const [draft, setDraft] = useState(q);
  const { items, error, isLoading } = useNews(q);

  // The search goes in the URL after a pause in typing.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = draft.trim();
      if (next !== q) router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname, { scroll: false });
    }, 400);
    return () => clearTimeout(id);
  }, [draft, q, pathname, router]);

  return (
    <div className="pt-10 sm:pt-14">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">News</h1>
        {!q && (
          <span className="label inline-flex items-center gap-1.5 text-subtle">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-50" />
              <span className="relative inline-flex size-1.5 rounded-full bg-up" />
            </span>
            Live
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted">What&apos;s in the news right now. Tokens shows every token named after a story.</p>

      <label className="mt-6 flex h-9 w-full items-center gap-2 rounded-md border border-border px-3 transition-colors focus-within:border-border-strong sm:max-w-sm">
        <Search className="size-3.5 text-subtle" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search the news"
          maxLength={100}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
        />
      </label>

      <div className="mt-4">
        {isLoading && !items.length ? (
          <div className="rounded-lg border border-border">
            <ListSkeleton rows={6} />
          </div>
        ) : !items.length ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
            <Newspaper className="mx-auto size-5 text-subtle" />
            <p className="mt-3 font-medium">{q ? `No headlines for “${q}”` : "No headlines right now"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              {error ? "Couldn't reach the news. Trying again shortly." : q ? "Try other words." : "Check back in a minute."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items.map((item) => (
              <Headline key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
