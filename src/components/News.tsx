"use client";

import clsx from "clsx";
import { ArrowUpRight, ChevronDown, ChevronRight, Coins, Newspaper, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPercent, formatUsd, shortAddress, tokenHref } from "@/lib/format";
import { useNamesakes, useNews } from "@/lib/hooks";
import { passes, setTokenFilters, TXNS_STEPS, USD_STEPS, useTokenFilters, type TokenFilters } from "@/lib/token-filters";
import type { NamesakesResponse, NewsCategory, NewsItem } from "@/lib/types";
import { ChainTag } from "./Chain";
import { Tab } from "./Leaderboard";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ListSkeleton, TokenName } from "./TokenList";

const TABS = { all: "All", world: "World", viral: "Viral", crypto: "Crypto", tech: "Tech" } as const;
type TabKey = keyof typeof TABS;

/** "All" takes the newest this many of each category, so crypto's many outlets don't bury the viral stories. */
const ALL_EACH = 25;

/** A tab's headlines, newest first (they come sorted). */
function inTab(items: NewsItem[], tab: TabKey): NewsItem[] {
  if (tab !== "all") return items.filter((i) => i.category === tab);
  const counts = new Map<NewsCategory, number>();
  return items.filter((i) => {
    const n = counts.get(i.category) ?? 0;
    counts.set(i.category, n + 1);
    return n < ALL_EACH;
  });
}

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
          mc {formatUsd(m.marketCap ?? m.fdv)} · vol {formatUsd(m.volume24h)} · liq {formatUsd(m.liquidityUsd)}
          {m.txns24h !== null && m.txns24h !== undefined && <> · {m.txns24h.toLocaleString("en-US")} txns</>} · 24h{" "}
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

/** "any", "$1K", "$10K", "$100K", "$1M" (or a count, for transactions). */
function stepLabel(value: number, usd: boolean): string {
  if (!value) return "any";
  const short = value >= 1_000_000 ? `${value / 1_000_000}M` : value >= 1_000 ? `${value / 1_000}K` : String(value);
  return usd ? `$${short}` : short;
}

/** The minimums a token must meet to be listed, the same for every story (kept in this browser). */
function Minimums({ filters }: { filters: TokenFilters }) {
  const fields: [keyof TokenFilters, readonly number[], boolean][] = [
    ["mc", USD_STEPS, true],
    ["vol", USD_STEPS, true],
    ["liq", USD_STEPS, true],
    ["txns", TXNS_STEPS, false],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-2 font-mono text-[11px] text-subtle">
      <span>min</span>
      {fields.map(([key, steps, usd]) => (
        <label key={key} className="inline-flex items-center gap-1">
          {key}
          <select
            value={filters[key]}
            onChange={(e) => setTokenFilters({ ...filters, [key]: Number(e.target.value) })}
            aria-label={`Minimum ${key}`}
            className="h-6 cursor-pointer rounded border border-border bg-bg px-1 text-[11px] text-fg outline-none hover:bg-surface-2 focus-visible:border-border-strong"
          >
            {steps.map((v) => (
              <option key={v} value={v}>
                {stepLabel(v, usd)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/**
 * Every token named after a story: pick one of the names in the headline (the likeliest is picked) or type
 * another, then pick a token by its numbers. Many tokens share a name or a ticker.
 */
function Namesakes({ keywords }: { keywords: string[] }) {
  const [keyword, setKeyword] = useState(keywords[0] ?? "");
  const [draft, setDraft] = useState("");
  const [showAll, setShowAll] = useState(false);
  const found = useNamesakes(keyword);
  const { error, isLoading } = found;
  const filters = useTokenFilters();
  const kept = found.items.filter((n) => passes(n.market, filters));
  const items = showAll ? found.items : kept;
  const hidden = found.items.length - kept.length;

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
      <Minimums filters={filters} />
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
            <p className="px-3 py-4 text-sm text-muted">
              {hidden ? "Every token named like this is below the minimums." : "No token named like this on DexScreener yet."}
            </p>
          ) : (
            <div className="mt-1 divide-y divide-border">
              {items.map((n) => (
                <Namesake key={`${n.market.chainId}:${n.market.address}`} {...n} />
              ))}
            </div>
          )}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="w-full border-t border-border px-3 py-2 text-left font-mono text-[11px] text-subtle transition-colors hover:text-fg"
            >
              {showAll ? "hide the ones below the minimums" : `${hidden} more below the minimums · show them`}
            </button>
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
  const picked = params.get("category");
  const tab: TabKey = picked && picked in TABS ? (picked as TabKey) : "all";
  const [draft, setDraft] = useState(q);
  const news = useNews(q);
  const { error, isLoading } = news;
  // A search spans every tab.
  const items = q ? news.items : inTab(news.items, tab);

  function setParam(key: string, value: string, fallback: string) {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  // The search goes in the URL after a pause in typing.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = draft.trim();
      if (next === q) return;
      const qs = new URLSearchParams(params.toString());
      if (next) qs.set("q", next);
      else qs.delete("q");
      router.replace(`${pathname}${qs.size ? `?${qs}` : ""}`, { scroll: false });
    }, 400);
    return () => clearTimeout(id);
  }, [draft, q, params, pathname, router]);

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

      {!q && (
        <div
          className="scrollbar-none fade-end -mx-4 mt-4 flex gap-6 overflow-x-auto border-b border-border pr-10 pl-4 sm:mx-0 sm:px-0"
          role="tablist"
          aria-label="Category"
        >
          {(Object.keys(TABS) as TabKey[]).map((key) => (
            <Tab key={key} active={tab === key} onClick={() => setParam("category", key, "all")}>
              {TABS[key]}
            </Tab>
          ))}
        </div>
      )}

      <div className="mt-4">
        {isLoading && !items.length ? (
          <div className="rounded-lg border border-border">
            <ListSkeleton rows={6} />
          </div>
        ) : !items.length ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
            <Newspaper className="mx-auto size-5 text-subtle" />
            <p className="mt-3 font-medium">
              {q ? `No headlines for “${q}”` : tab === "all" ? "No headlines right now" : `No ${TABS[tab].toLowerCase()} headlines right now`}
            </p>
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
