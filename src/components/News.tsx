"use client";

import { ArrowUpRight, ChevronDown, Newspaper } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { tokenHref } from "@/lib/format";
import { useNews } from "@/lib/hooks";
import type { NewsItem } from "@/lib/types";
import { TimeAgo } from "./TimeAgo";
import { ListSkeleton } from "./TokenList";

function Headline({ item }: { item: NewsItem }) {
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
      <div className="tabular mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-subtle">
        <Link href={tokenHref(item.token)} className="font-sans font-medium text-muted hover:text-fg hover:underline">
          ${item.token.symbol}
        </Link>
        {item.source && (
          <>
            <span>·</span>
            <span>{item.source}</span>
          </>
        )}
        <span>·</span>
        <TimeAgo at={item.publishedAt} compact />
      </div>
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
