"use client";

import clsx from "clsx";
import { ArrowLeft, Check, CircleAlert, ExternalLink, LoaderCircle, Lock, Share2 } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { chainMeta } from "@/lib/chains";
import {
  formatChange,
  formatDate,
  formatMultiple,
  formatPercent,
  formatPrice,
  formatUsd,
  shortAddress,
} from "@/lib/format";
import { fetcher, useMyCalls } from "@/lib/hooks";
import { MILESTONES, ratio } from "@/lib/metrics";
import { trackPaste } from "@/lib/track";
import type { Link as TokenLink, MarketSnapshot, TokenResponse, TokenView } from "@/lib/types";
import { CopyButton } from "./CopyButton";
import { DecryptText } from "./DecryptText";
import { ChangeText, MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";

export function TokenDetail({ chain, address, initial }: { chain: string; address: string; initial: TokenResponse }) {
  const key = `/api/tokens/${chain}/${encodeURIComponent(address)}`;
  const { data, mutate } = useSWR<TokenResponse>(key, fetcher, {
    fallbackData: initial,
    refreshInterval: 15_000,
    revalidateOnMount: false,
  });
  const { token, preview } = data ?? initial;

  return (
    <div className="pt-6 sm:pt-10">
      <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Leaderboard
      </Link>
      {token ? (
        <Tracked token={token} />
      ) : preview ? (
        <Untracked preview={preview} onTracked={() => mutate()} />
      ) : (
        <div className="mt-8 rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <CircleAlert className="mx-auto size-5 text-subtle" />
          <p className="mt-3 font-medium">Token not found</p>
          <p className="mt-1 text-sm text-muted">
            No DEX pair on {chainMeta(chain).name} for <span className="font-mono">{shortAddress(address)}</span>.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------

function linkLabel(l: TokenLink) {
  if (l.label === "twitter") return "X";
  return l.label.charAt(0).toUpperCase() + l.label.slice(1);
}

const GHOST =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg";

function Header({ market, fallback }: { market: MarketSnapshot | null; fallback: TokenView | MarketSnapshot }) {
  const src = market ?? fallback;
  const links = market ? [...market.websites, ...market.socials].slice(0, 4) : [];
  return (
    <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-baseline gap-3">
          <span className="text-3xl font-semibold tracking-tight sm:text-4xl">${src.symbol}</span>
          <span className="truncate text-lg text-muted">{src.name}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-subtle">
          <span>{chainMeta(src.chainId).name.toLowerCase()}</span>
          {market?.dexId && (
            <>
              <span>/</span>
              <span>{market.dexId}</span>
            </>
          )}
          <span>/</span>
          <CopyButton value={src.address} label={shortAddress(src.address)} />
        </div>
      </div>
      {market && (
        <div className="flex flex-wrap items-center gap-2">
          <a href={market.url} target="_blank" rel="noreferrer" className={GHOST}>
            DexScreener <ExternalLink className="size-3" />
          </a>
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={GHOST}>
              {linkLabel(l)} <ExternalLink className="size-3" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-lg border border-border", className)}>
      {title && <h2 className="border-b border-border px-4 py-2.5 text-sm font-medium">{title}</h2>}
      <div className="p-4">{children}</div>
    </section>
  );
}

function StatRow({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="tabular text-right font-mono text-[13px]">
        {value}
        {sub && <div className="text-[11px] text-subtle">{sub}</div>}
      </dd>
    </div>
  );
}

function tone(multiple: number) {
  return multiple > 1.005 ? "text-up" : multiple < 0.995 ? "text-down" : "text-fg";
}

function Tracked({ token: t }: { token: TokenView }) {
  const myCall = useMyCalls().find((c) => c.id === t.id);
  const m = t.market;

  return (
    <>
      <Header market={m} fallback={t} />

      <div className="mt-8 grid gap-6 lg:grid-cols-3 lg:grid-rows-[auto_1fr] lg:items-start">
        {/* Hero multiple */}
        <section className="rounded-lg border border-border lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
            <div>
              <div className="label text-subtle">Since first paste</div>
              <div
                className={clsx(
                  "tabular mt-3 font-mono text-6xl leading-none font-medium tracking-[-0.06em] sm:text-7xl",
                  tone(t.multiple),
                )}
              >
                <DecryptText text={formatMultiple(t.multiple)} duration={700} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px]">
                <ChangeText multiple={t.multiple} />
                <span className="tabular text-muted">
                  {formatUsd(t.entryMarketCap)} → <span className="text-fg">{formatUsd(t.marketCap)}</span> mc
                </span>
              </div>
            </div>
            <ShareButton token={t} />
          </div>
          <dl className="grid gap-x-6 gap-y-2 border-t border-border px-5 py-4 font-mono text-[11px] sm:grid-cols-[auto_1fr] sm:px-6">
            <dt className="text-subtle">first paste</dt>
            <dd className="text-muted">
              <span suppressHydrationWarning>{formatDate(t.firstPastedAt)}</span> (<TimeAgo at={t.firstPastedAt} />) ·{" "}
              {t.pasteCount.toLocaleString("en-US")} {t.pasteCount === 1 ? "paste" : "pastes"}
            </dd>
            <dt className="flex items-center gap-1.5 text-subtle">
              <Lock className="size-3" /> entry seal
            </dt>
            <dd className="flex min-w-0 items-center gap-2 text-muted">
              <span className="truncate" title={`sha256(${t.chainId}:${t.address}:${t.entryPriceUsd}:${t.firstPastedAt})`}>
                sha256 {t.seal}
              </span>
              <CopyButton value={t.seal} />
            </dd>
            {t.stale && (
              <>
                <dt className="text-subtle">status</dt>
                <dd className="text-down">
                  live data delayed, last update <TimeAgo at={t.lastCheckedAt} />
                </dd>
              </>
            )}
          </dl>
        </section>

        {/* Side column */}
        <div className="space-y-6 lg:row-span-2">
          {myCall && (
            <Section title="Your call">
              <div className="flex items-center justify-between gap-3">
                <div className="tabular font-mono text-xs text-muted">
                  entry {formatUsd(myCall.entryMarketCap)} · <TimeAgo at={myCall.pastedAt} />
                </div>
                <MultipleBadge multiple={ratio(m?.priceUsd ?? t.entryPriceUsd, myCall.entryPriceUsd)} />
              </div>
            </Section>
          )}
          <Milestones token={t} />
          <Section title="Stats">
            <dl className="-my-2 divide-y divide-border">
              <StatRow label="Price" value={formatPrice(m?.priceUsd)} sub={`entry ${formatPrice(t.entryPriceUsd)}`} />
              <StatRow
                label="Peak since paste"
                value={<span className={t.peakMultiple >= 2 ? "text-up" : undefined}>{formatMultiple(t.peakMultiple)}</span>}
                sub={
                  <>
                    {t.entryMarketCap !== null && `${formatUsd(t.entryMarketCap * t.peakMultiple)} · `}
                    <TimeAgo at={t.peakAt} />
                  </>
                }
              />
              <StatRow
                label="Lowest since paste"
                value={<span className={t.lowMultiple < 1 ? "text-down" : undefined}>{formatChange(t.lowMultiple)}</span>}
                sub={<TimeAgo at={t.lowAt} />}
              />
              <StatRow label="Liquidity" value={formatUsd(m?.liquidityUsd)} />
              <StatRow label="Volume 24h" value={formatUsd(m?.volume24h)} />
              <StatRow
                label="Change 24h"
                value={
                  <span className={(m?.priceChange24h ?? 0) >= 0 ? "text-up" : "text-down"}>
                    {formatPercent(m?.priceChange24h)}
                  </span>
                }
              />
              {m?.pairCreatedAt && <StatRow label="Pair created" value={<TimeAgo at={m.pairCreatedAt} />} />}
            </dl>
          </Section>
        </div>

        {/* Chart */}
        {m && <Chart market={m} className="lg:col-span-2" />}
      </div>
    </>
  );
}

function Milestones({ token: t }: { token: TokenView }) {
  const next = MILESTONES.find((x) => t.multiple < x);
  return (
    <Section title="Milestones">
      <ol className="grid grid-cols-4 gap-px overflow-hidden rounded-md border border-border bg-border">
        {MILESTONES.map((x) => {
          const hit = t.peakMultiple >= x;
          const live = t.multiple >= x;
          return (
            <li
              key={x}
              className={clsx(
                "relative bg-bg px-2 py-2.5 text-center font-mono",
                live ? "text-up" : hit ? "text-fg" : "text-subtle",
              )}
              title={live ? `Above ${x}x now` : hit ? `Touched ${x}x` : "Not reached yet"}
            >
              {hit && <Check className="absolute top-1 right-1 size-2.5" strokeWidth={3} />}
              <div className="tabular text-sm">{x}x</div>
              <div className="tabular truncate text-[10px] opacity-70">
                {t.entryMarketCap !== null ? formatUsd(t.entryMarketCap * x) : "—"}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 font-mono text-[11px] text-muted">
        {t.multiple < 1 ? (
          <>
            needs <span className="text-fg">{formatChange(1 / t.multiple)}</span> to get back to entry
          </>
        ) : next ? (
          <>
            next <span className="text-fg">{next}x</span>
            {t.entryMarketCap !== null && <> at {formatUsd(t.entryMarketCap * next)}</>} · needs{" "}
            <span className="text-fg">{formatChange(next / t.multiple)}</span>
          </>
        ) : (
          "every milestone cleared"
        )}
      </p>
    </Section>
  );
}

function Chart({ market, className }: { market: MarketSnapshot; className?: string }) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";
  const demo = market.pairAddress.startsWith("mockpair");
  const src =
    `https://dexscreener.com/${market.chainId}/${market.pairAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0` +
    `&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=${theme}&theme=${theme}&chartStyle=1&chartType=marketCap&interval=15`;
  return (
    <section className={clsx("overflow-hidden rounded-lg border border-border", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-medium">Chart</h2>
        <a
          href={market.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
        >
          DexScreener <ExternalLink className="size-3" />
        </a>
      </div>
      {demo ? (
        <div className="grid h-[360px] place-items-center font-mono text-xs text-subtle">chart unavailable in demo mode</div>
      ) : (
        <iframe
          key={theme}
          src={src}
          title={`${market.symbol} chart`}
          loading="lazy"
          className="h-[420px] w-full sm:h-[480px]"
        />
      )}
    </section>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function ShareButton({ token: t }: { token: TokenView }) {
  const [copied, setCopied] = useState(false);
  const text = `$${t.symbol} is ${formatMultiple(t.multiple)} since it was first pasted on Rankr at ${formatUsd(t.entryMarketCap)} MC`;

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `$${t.symbol} on Rankr`, text, url });
        return;
      } catch {
        /* cancelled, fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() =>
          window.open(
            `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`,
            "_blank",
            "noopener,noreferrer",
          )
        }
        className="grid size-8 place-items-center rounded-md border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        aria-label="Post on X"
        title="Post on X"
      >
        <XIcon className="size-3.5" />
      </button>
      <button type="button" onClick={share} className={GHOST}>
        {copied ? <Check className="size-3.5 text-up" /> : <Share2 className="size-3.5" />}
        {copied ? "Copied" : "Share"}
      </button>
    </div>
  );
}

function Untracked({ preview: p, onTracked }: { preview: MarketSnapshot; onTracked: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mc = p.marketCap ?? p.fdv;

  async function track() {
    setLoading(true);
    setError(null);
    try {
      await trackPaste(p.address, p.chainId);
      onTracked();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <>
      <Header market={p} fallback={p} />
      <section className="mt-8 flex flex-col gap-4 rounded-lg border border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Not on Rankr yet</p>
          <p className="mt-1 text-sm text-muted">
            Track it now and the entry is sealed at <span className="tabular font-mono text-fg">{formatUsd(mc)}</span> mc (
            {formatPrice(p.priceUsd)}).
          </p>
          {error && <p className="mt-2 text-sm text-down">{error}</p>}
        </div>
        <button
          type="button"
          onClick={track}
          disabled={loading}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-85 disabled:opacity-60"
        >
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Lock className="size-3.5" />}
          Track and seal entry
        </button>
      </section>
      <div className="mt-6">
        <Chart market={p} />
      </div>
    </>
  );
}
