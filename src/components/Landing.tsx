"use client";

import clsx from "clsx";
import { Check, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { chainMeta } from "@/lib/chains";
import { formatChange, formatDate, formatMultiple, formatUsd, shortAddress, tokenHref } from "@/lib/format";
import { useTokens } from "@/lib/hooks";
import { APP_HOME } from "@/lib/login";
import { MILESTONES } from "@/lib/metrics";
import { isStandalone } from "@/lib/pwa";
import { DecryptText } from "./DecryptText";
import { toneOf } from "./MultipleBadge";

/** The installed app opens on /app; if it ever lands on the landing page (e.g. added from /), go there. */
export function StandaloneRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (isStandalone()) router.replace(APP_HOME);
  }, [router]);
  return null;
}

type Call = {
  symbol: string;
  name: string;
  chainId: string;
  address: string | null;
  multiple: number;
  peakMultiple: number;
  entryMarketCap: number | null;
  marketCap: number | null;
  sealedAt: number | null;
  seal: string | null;
};

/** Shown on an empty board, labeled as an example. */
const EXAMPLE: Call = {
  symbol: "YOURCA",
  name: "your first call",
  chainId: "solana",
  address: null,
  multiple: 12.4,
  peakMultiple: 15.1,
  entryMarketCap: 48_200,
  marketCap: 597_680,
  sealedAt: null,
  seal: null,
};

/** The hero's preview: the board's #1 token right now, the way its token page shows it. */
export function LiveCall() {
  const { tokens, isLoading } = useTokens({ sort: "top", limit: 1 });
  const top = tokens[0];

  if (isLoading && !top) {
    return (
      <div className="h-[19.5rem] animate-pulse rounded-xl border border-border bg-surface sm:h-[18rem]" aria-hidden />
    );
  }

  const call: Call = top
    ? { ...top, sealedAt: top.firstPastedAt, seal: top.seal }
    : EXAMPLE;
  const live = !!top;
  const tone = toneOf(call.multiple, "text-fg");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5">
        <span className="label inline-flex items-center gap-2 text-subtle">
          <span className={clsx("size-1.5 rounded-full", live ? "bg-up" : "bg-subtle")} />
          {live ? "#1 on the board right now" : "Example"}
        </span>
        {top && (
          <Link href={tokenHref(top)} className="text-xs text-muted hover:text-fg">
            Token page
          </Link>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-xl font-semibold tracking-tight">${call.symbol}</span>
          <span className="truncate text-muted">{call.name}</span>
        </div>
        <div className="mt-1 font-mono text-[11px] text-subtle">
          {chainMeta(call.chainId).name.toLowerCase()}
          {call.address && <> / {shortAddress(call.address)}</>}
        </div>
        <div className="label mt-6 text-subtle">Since first paste</div>
        <div className={clsx("tabular mt-2 font-mono text-5xl leading-none font-medium tracking-[-0.06em] sm:text-6xl", tone)}>
          <DecryptText text={formatMultiple(call.multiple)} duration={700} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px]">
          <span className={clsx("tabular", tone)}>{formatChange(call.multiple)}</span>
          <span className="tabular text-muted">
            entry {formatUsd(call.entryMarketCap)} · now <span className="text-fg">{formatUsd(call.marketCap)}</span>
          </span>
        </div>
      </div>

      <ol className="grid grid-cols-4 gap-px border-t border-border bg-border sm:grid-cols-8" aria-label="Milestones">
        {MILESTONES.map((x) => {
          const hit = call.peakMultiple >= x;
          const now = call.multiple >= x;
          return (
            <li
              key={x}
              className={clsx(
                "relative bg-surface px-2 py-2 text-center font-mono",
                now ? "text-up" : hit ? "text-fg" : "text-subtle",
              )}
            >
              {hit && <Check className="absolute top-1 right-1 size-2.5" strokeWidth={3} aria-label="reached" />}
              <div className="tabular text-[13px]">{x}x</div>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 font-mono text-[11px] text-subtle sm:px-5">
        <Lock className="size-3 shrink-0" />
        <span className="min-w-0 truncate">
          {call.seal && call.sealedAt ? (
            <>
              sealed {formatDate(call.sealedAt)} · sha256 <span className="text-muted">{call.seal.slice(0, 16)}…</span>
            </>
          ) : (
            "entry sealed with sha256 the second you paste"
          )}
        </span>
      </div>
    </div>
  );
}
