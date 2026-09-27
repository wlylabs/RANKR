"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  Check,
  ChartCandlestick,
  CircleAlert,
  ExternalLink,
  Globe,
  LoaderCircle,
  Lock,
  Send,
  Share2,
} from "lucide-react";
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
import { MILESTONES, ratio, tierOf } from "@/lib/metrics";
import { trackPaste } from "@/lib/track";
import type { Link as TokenLink, MarketSnapshot, TokenResponse, TokenView } from "@/lib/types";
import { CopyButton } from "./CopyButton";
import { ChangeText, MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ChainBadge, TokenAvatar } from "./TokenAvatar";

export function TokenDetail({ chain, address, initial }: { chain: string; address: string; initial: TokenResponse }) {
  const key = `/api/tokens/${chain}/${encodeURIComponent(address)}`;
  const { data, mutate } = useSWR<TokenResponse>(key, fetcher, {
    fallbackData: initial,
    refreshInterval: 15_000,
    revalidateOnMount: false,
  });
  const { token, preview } = data ?? initial;

  return (
    <div className="pt-4 sm:pt-8">
      <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Leaderboard
      </Link>
      {token ? (
        <Tracked token={token} />
      ) : preview ? (
        <Untracked preview={preview} onTracked={() => mutate()} />
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <CircleAlert className="mx-auto size-8 text-subtle" />
          <p className="mt-3 font-semibold">Token not found</p>
          <p className="mt-1 text-sm text-muted">
            No DEX pair on {chainMeta(chain).name} for <span className="font-mono">{shortAddress(address)}</span>.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function linkIcon(label: string) {
  if (label === "twitter" || label === "x") return <XIcon className="size-3.5" />;
  if (label === "telegram") return <Send className="size-3.5" />;
  if (label === "website" || label.toLowerCase().includes("web")) return <Globe className="size-3.5" />;
  return <ExternalLink className="size-3.5" />;
}

function linkLabel(l: TokenLink) {
  if (l.label === "twitter") return "X";
  return l.label.charAt(0).toUpperCase() + l.label.slice(1);
}

function Header({ market, fallback }: { market: MarketSnapshot | null; fallback: TokenView | MarketSnapshot }) {
  const src = market ?? fallback;
  const links = market ? [...market.websites, ...market.socials].slice(0, 5) : [];
  return (
    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <TokenAvatar
          symbol={src.symbol}
          imageUrl={src.imageUrl}
          chainId={src.chainId}
          size={52}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-pixel text-3xl sm:text-4xl">${src.symbol}</h1>
            <ChainBadge chainId={src.chainId} />
            {market?.dexId && (
              <span className="rounded border border-border px-1 py-px font-mono text-[10px] leading-4 text-muted uppercase">
                {market.dexId}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-muted">
            <span className="truncate">{src.name}</span>
            <span className="text-subtle">·</span>
            <CopyButton value={src.address} label={shortAddress(src.address)} />
          </div>
        </div>
      </div>
      {market && (
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <a
            href={market.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-[11px] text-muted uppercase transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <ChartCandlestick className="size-3.5" /> DexScreener
          </a>
          {links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-[11px] text-muted uppercase transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {linkIcon(l.label)} {linkLabel(l)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-xl border border-border bg-surface p-4 sm:p-5", className)}>
      {title && <h2 className="label mb-3 text-muted">{title}</h2>}
      {children}
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

const BIG_COLOR = {
  moon: "text-up",
  pump: "text-up",
  up: "text-up",
  flat: "text-fg",
  down: "text-down",
  rekt: "text-down",
} as const;

function Tracked({ token: t }: { token: TokenView }) {
  const myCall = useMyCalls().find((c) => c.id === t.id);
  const m = t.market;
  const tier = tierOf(t.multiple);

  return (
    <>
      <Header market={m} fallback={t} />

      <div className="mt-6 grid gap-4 lg:grid-cols-3 lg:grid-rows-[auto_1fr] lg:items-start">
        {/* Hero multiple */}
        <Card className="relative overflow-hidden lg:col-span-2">
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="label flex items-center gap-1.5 text-subtle">
                <Lock className="size-3" /> Since first paste on Rankr
              </div>
              <div className={clsx("tabular mt-3 font-pixel text-7xl leading-none sm:text-8xl", BIG_COLOR[tier])}>
                {formatMultiple(t.multiple)}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px]">
                <ChangeText multiple={t.multiple} />
                <span className="tabular text-muted">
                  {formatUsd(t.entryMarketCap)} <span className="text-subtle">→</span>{" "}
                  <span className="font-semibold text-fg">{formatUsd(t.marketCap)}</span> MC
                </span>
              </div>
            </div>
            <ShareButton token={t} />
          </div>
          <div className="relative mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-4 font-mono text-[11px] text-muted">
            <span>
              First pasted <span className="text-fg" suppressHydrationWarning>
                {formatDate(t.firstPastedAt)}
              </span> (<TimeAgo at={t.firstPastedAt} />)
            </span>
            <span>
              Pasted <span className="text-fg">{t.pasteCount.toLocaleString("en-US")}</span>{" "}
              {t.pasteCount === 1 ? "time" : "times"}
            </span>
            {t.stale && (
              <span className="text-brand-ink">
                Live data delayed, last update <TimeAgo at={t.lastCheckedAt} />
              </span>
            )}
          </div>
        </Card>

        {/* Side column */}
        <div className="space-y-4 lg:row-span-2">
          {myCall && (
            <Card
              title="Your call"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="tabular font-mono text-xs text-muted">
                  Entry {formatUsd(myCall.entryMarketCap)} · <TimeAgo at={myCall.pastedAt} />
                </div>
                <MultipleBadge multiple={ratio(m?.priceUsd ?? t.entryPriceUsd, myCall.entryPriceUsd)} />
              </div>
            </Card>
          )}
          <Milestones token={t} />
          <Card title="Stats">
            <dl className="divide-y divide-border/70">
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
            <p className="mt-2 font-mono text-[10px] text-subtle">Peak and low are sampled whenever Rankr refreshes the token.</p>
          </Card>
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
    <Card title="Milestones">
      <ol className="grid grid-cols-4 gap-2">
        {MILESTONES.map((x) => {
          const hit = t.peakMultiple >= x;
          const live = t.multiple >= x;
          return (
            <li
              key={x}
              className={clsx(
                "relative rounded-md border px-2 py-2 text-center font-mono",
                live
                  ? "border-up bg-up text-bg"
                  : hit
                    ? "border-up/40 bg-up-soft text-up"
                    : "border-dashed border-border text-subtle",
              )}
              title={hit ? `Reached ${x}x` : `Not reached yet`}
            >
              {hit && <Check className="absolute top-1 right-1 size-3" strokeWidth={3} />}
              <div className="tabular text-sm font-semibold">{x}x</div>
              <div className="tabular truncate text-[10px] opacity-80">
                {t.entryMarketCap !== null ? formatUsd(t.entryMarketCap * x) : "—"}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 font-mono text-[11px] text-muted">
        {t.multiple < 1 ? (
          <>
            Needs <span className="font-semibold text-fg">{formatChange(1 / t.multiple)}</span> to get back to entry.
          </>
        ) : next ? (
          <>
            Next: <span className="font-semibold text-fg">{next}x</span>
            {t.entryMarketCap !== null && <> at {formatUsd(t.entryMarketCap * next)} MC</>}, needs{" "}
            <span className="font-semibold text-fg">{formatChange(next / t.multiple)}</span>.
          </>
        ) : (
          "Every milestone cleared. Legendary."
        )}
      </p>
    </Card>
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
    <section className={clsx("overflow-hidden rounded-xl border border-border bg-surface", className)}>
      <div className="flex items-center justify-between px-4 py-3 sm:px-5">
        <h2 className="label text-muted">Chart</h2>
        <a href={market.url} target="_blank" rel="noreferrer" className="label inline-flex items-center gap-1 text-subtle hover:text-fg">
          Open on DexScreener <ExternalLink className="size-3" />
        </a>
      </div>
      {demo ? (
        <div className="grid h-[360px] place-items-center border-t border-border font-mono text-xs text-subtle">
          Chart is not available in demo mode.
        </div>
      ) : (
        <iframe
          key={theme}
          src={src}
          title={`${market.symbol} chart`}
          loading="lazy"
          className="h-[420px] w-full border-t border-border sm:h-[480px]"
        />
      )}
    </section>
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
        className="grid size-9 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        aria-label="Post on X"
        title="Post on X"
      >
        <XIcon className="size-4" />
      </button>
      <button
        type="button"
        onClick={share}
        className="label inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        {copied ? <Check className="size-4 text-up" /> : <Share2 className="size-4" />}
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
      <Card className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Not on Rankr yet</p>
            <p className="mt-1 text-sm text-muted">
              Track it now and the entry locks at <span className="tabular font-semibold text-fg">{formatUsd(mc)}</span> MC (
              {formatPrice(p.priceUsd)}).
            </p>
          </div>
          <button
            type="button"
            onClick={track}
            disabled={loading}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-brand-fg transition hover:brightness-110 disabled:opacity-70"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Track & lock entry
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-down">{error}</p>}
      </Card>
      <div className="mt-4">
        <Chart market={p} />
      </div>
    </>
  );
}
