"use client";

import clsx from "clsx";
import { ArrowUpRight, Check, CircleAlert, CircleHelp, Crosshair, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatCount, formatPrice, formatUsd, tokenHref } from "@/lib/format";
import { apiFetch } from "@/lib/supabase-browser";
import { EVM_TRACE_CHAINS, explorerAddress, traceChain, traceHref, type TraceChain } from "@/lib/trace/chains";
import type {
  TokenCheck,
  TokenCheckStatus,
  TokenHolder,
  TokenReport as Report,
  TokenTrader,
  TokenVerdict,
} from "@/lib/trace/types";
import { Avatar } from "../Avatar";
import { CopyButton } from "../CopyButton";
import { TimeAgo } from "../TimeAgo";
import { FullAddress, LabelTag, Scramble } from "./TraceCard";
import { TraceInput } from "./TraceInput";

const linkClass =
  "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-fg";

type ReadError = { message: string; code?: string };

/** Reads the token's report; `reload` reads it again (the server keeps one a minute). */
function useReport(chain: string, address: string) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<ReadError | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/trace/token/${chain}/${encodeURIComponent(address)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) setError({ message: body?.error ?? `Request failed (${res.status})`, code: body?.code });
      else setReport(body as Report);
    } catch {
      setError({ message: "Couldn't reach Rankr. Check your connection." });
    } finally {
      setLoading(false);
    }
  }, [chain, address]);
  useEffect(() => void load(), [load]);
  return { report, error, loading, reload: load };
}

const chainName = (chain: TraceChain) =>
  chain.id === "solana" ? "Solana" : chain.id.charAt(0).toUpperCase() + chain.id.slice(1);

/** "42 min", "3.5h", "1 day". */
function span(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = ms / 3_600_000;
  return h < 24 ? `${h < 10 ? h.toFixed(1) : Math.round(h)}h` : "1 day";
}

const VERDICT: Record<TokenVerdict, { title: string; box: string; text: string; Icon: typeof Check }> = {
  danger: {
    title: "Warning signs",
    box: "border-down/40 bg-down-soft",
    text: "text-down",
    Icon: TriangleAlert,
  },
  check: { title: "Worth a closer look", box: "border-border-strong", text: "text-fg", Icon: CircleAlert },
  clear: { title: "No warning signs", box: "border-up/40 bg-up-soft", text: "text-up", Icon: Check },
};

const STATUS: Record<TokenCheckStatus, { Icon: typeof Check; className: string; label: string }> = {
  bad: { Icon: TriangleAlert, className: "text-down", label: "Warning sign" },
  warn: { Icon: CircleAlert, className: "text-fg", label: "Worth a look" },
  unknown: { Icon: CircleHelp, className: "text-subtle", label: "Couldn't read" },
  ok: { Icon: Check, className: "text-up", label: "Fine" },
};

const GROUPS: Record<TokenCheck["group"], string> = {
  contract: "Contract",
  liquidity: "Liquidity",
  holders: "Holders",
  trading: "Trading",
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The verdict, and every check behind it: warning signs first. */
function Verdict({ report }: { report: Report }) {
  const v = VERDICT[report.verdict];
  const count = (s: TokenCheckStatus) => report.checks.filter((c) => c.status === s).length;
  const bad = count("bad");
  const look = count("warn") + count("unknown");
  const summary =
    report.verdict === "danger"
      ? `${plural(bad, "warning sign")}${look ? ` · ${look} to check` : ""}`
      : report.verdict === "check"
        ? `${look} to check · no warning sign`
        : `${plural(count("ok"), "check")}, nothing found`;
  return (
    <section className={clsx("rounded-xl border p-4 sm:p-5", v.box)} aria-labelledby="verdict-title">
      <div className="flex items-start gap-3">
        <v.Icon className={clsx("mt-1 size-5 shrink-0", v.text)} />
        <div className="min-w-0">
          <h2 id="verdict-title" className={clsx("text-xl font-semibold tracking-[-0.02em]", v.text)}>
            {v.title}
          </h2>
          <p className="label mt-0.5 text-muted">{summary}</p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-border border-t border-border">
        {report.checks.map((c) => {
          const s = STATUS[c.status];
          return (
            <li key={c.id} className="flex gap-2.5 py-2.5 text-sm">
              <s.Icon className={clsx("mt-0.5 size-4 shrink-0", s.className)} aria-label={s.label} />
              <span className="min-w-0 flex-1 text-pretty">
                {c.text}
                <span className="text-[12px] text-subtle">
                  {" "}
                  · {GROUPS[c.group]}
                  {c.source && <> · {c.source}</>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12px] leading-relaxed text-subtle">
        Read just now from public data. A warning sign is a fact about the token, not proof of a scam; no warning signs
        isn&apos;t a promise: a token that passes every check can still be dumped on. Not financial advice.
      </p>
    </section>
  );
}

function Stat({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label text-subtle">{k}</dt>
      <dd className="tabular mt-0.5 truncate font-mono text-[15px]">{children}</dd>
    </div>
  );
}

/** Buys against sells in each window: counts over every pool, a bar for the split, the wallets behind them. */
function Flow({ report }: { report: Report }) {
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="flow-title">
      <h2 id="flow-title" className="label text-fg">
        Buys and sells
      </h2>
      <p className="mt-1 text-[12px] text-muted">
        Trades over {plural(report.pools, "pool")}; wallets in the main pool.
      </p>
      <ul className="mt-3 space-y-3">
        {report.flow.map((w) => {
          const total = w.buys + w.sells;
          const share = total ? (w.buys / total) * 100 : 50;
          return (
            <li key={w.window} className="tabular grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
              <span className="label text-subtle">{w.window}</span>
              <div className="min-w-0">
                <div className="flex justify-between gap-3 font-mono text-[12.5px]">
                  <span className="text-up">{formatCount(w.buys)} buys</span>
                  <span className="text-right text-down">{formatCount(w.sells)} sells</span>
                </div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  {total > 0 && (
                    <>
                      <span className="bg-up" style={{ width: `${share}%` }} />
                      <span className="flex-1 bg-down" />
                    </>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-subtle">
                  {[
                    w.buyers !== null && w.sellers !== null
                      ? `${formatCount(w.buyers)} buyers · ${formatCount(w.sellers)} sellers`
                      : null,
                    w.volumeUsd !== null ? `${formatUsd(w.volumeUsd)} traded` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TraderRow({ chain, t, side }: { chain: TraceChain; t: TokenTrader; side: "buy" | "sell" }) {
  const net = side === "buy" ? t.buyUsd - t.sellUsd : t.sellUsd - t.buyUsd;
  return (
    <li className="flex items-center gap-2.5 py-2">
      <Avatar userId={t.address} size={26} className="rounded-[6px]" />
      <div className="min-w-0 flex-1">
        <FullAddress address={t.address} max={12} />
        <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[11.5px] text-subtle">
          {t.label && <LabelTag label={t.label} className="min-w-0" />}
          <span className="shrink-0">
            {t.buys}↑ {t.sells}↓ · <TimeAgo at={t.last} compact />
          </span>
        </p>
      </div>
      <span className={clsx("tabular shrink-0 font-mono text-[13px]", side === "buy" ? "text-up" : "text-down")}>
        {side === "buy" ? "+" : "−"}
        {formatUsd(net)}
      </span>
      <Link
        href={traceHref(chain.id, t.address)}
        className="grid size-8 shrink-0 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg"
        aria-label="Trace where this wallet's money goes"
        title="Trace this wallet"
      >
        <Crosshair className="size-3.5" />
      </Link>
    </li>
  );
}

/** Who's buying and who's selling in the latest trades, net, each a tap away from its own trail. */
function Traders({ report, chain }: { report: Report; chain: TraceChain }) {
  const t = report.trades;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="traders-title">
      <h2 id="traders-title" className="label text-fg">
        Where the buys and sells come from
      </h2>
      {!t ? (
        <p className="mt-2 text-sm text-muted">
          {report.pool ? "Couldn't read the latest trades right now." : "No pool trades it yet."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-muted">
            The latest {t.count} trades in the main pool, over {span(t.to - t.from)}:{" "}
            <span className="text-up">{formatUsd(t.buyUsd)} bought</span>,{" "}
            <span className="text-down">{formatUsd(t.sellUsd)} sold</span>, by {plural(t.wallets, "wallet")}. Net of
            what each sold or bought back. Tap the crosshair to follow a wallet&apos;s money.
          </p>
          <div className="mt-3 space-y-4">
            {(["buy", "sell"] as const).map((side) => {
              const list = side === "buy" ? t.buyers : t.sellers;
              return (
                <div key={side} className="min-w-0">
                  <h3 className={clsx("label", side === "buy" ? "text-up" : "text-down")}>
                    {side === "buy" ? "Top buyers" : "Top sellers"}
                  </h3>
                  {list.length ? (
                    <ul className="mt-1 divide-y divide-border">
                      {list.map((w) => (
                        <TraderRow key={w.address} chain={chain} t={w} side={side} />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted">None in these trades.</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-subtle">
            Trades{" "}
            <a href="https://www.geckoterminal.com" target="_blank" rel="noreferrer" className="underline">
              powered by GeckoTerminal
            </a>
          </p>
        </>
      )}
    </section>
  );
}

const ROLE: Record<NonNullable<TokenHolder["role"]>, string> = { pool: "Pool", burn: "Burn", creator: "Deployer" };

/** The biggest holders, a bar each, pools and burn addresses marked. */
function Holders({ report, chain }: { report: Report; chain: TraceChain }) {
  const h = report.holders;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="holders-title">
      <h2 id="holders-title" className="label text-fg">
        Holders
      </h2>
      {!h ? (
        <p className="mt-2 text-sm text-muted">Couldn&apos;t read the holders right now.</p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-muted">
            Top 10 wallets: {h.top10Pct.toFixed(1)}% of the supply (pools, burns and exchanges aside)
            {h.poolPct > 0 && <> · in pools: {h.poolPct.toFixed(1)}%</>}
            {h.count !== null && <> · {formatCount(h.count)} holders</>}
          </p>
          <ol className="mt-3 space-y-2">
            {h.top.slice(0, 12).map((x) => (
              <li key={x.address} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {x.role && (
                      <span
                        className={clsx(
                          "shrink-0 rounded-[3px] px-1 font-mono text-[9.5px] leading-[15px] tracking-wide uppercase",
                          x.role === "creator" ? "bg-fg text-bg" : "border border-border-strong text-muted",
                        )}
                      >
                        {ROLE[x.role]}
                      </span>
                    )}
                    {x.label && !x.role && <LabelTag label={x.label} className="shrink-0 text-[12px]" />}
                    <Link
                      href={traceHref(chain.id, x.address)}
                      className="min-w-0 flex-1 hover:underline"
                      title="Trace this wallet"
                    >
                      <FullAddress address={x.address} max={11.5} className="text-muted" />
                    </Link>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <span
                      className={clsx("block h-full", x.role ? "bg-border-strong" : "bg-fg")}
                      style={{ width: `${Math.min(100, x.pct)}%` }}
                    />
                  </div>
                </div>
                <span className="tabular font-mono text-[13px]">{x.pct.toFixed(x.pct >= 10 ? 1 : 2)}%</span>
              </li>
            ))}
          </ol>
          {chain.kind === "solana" && (
            <p className="mt-3 text-[11px] text-subtle">The 20 biggest token accounts, by wallet (Solana RPC).</p>
          )}
        </>
      )}
    </section>
  );
}

/** While the report is read: what's being read, a line at a time. */
function ReportBoot({ chain, address }: { chain: TraceChain; address: string }) {
  const lines: ReactNode[] = [
    <>Token · {chainName(chain)}</>,
    <>
      Target
      <FullAddress address={address} max={12.5} className="mt-0.5 text-fg" />
    </>,
    "Reading its pools",
    "Reading the latest trades",
    "Checking the contract",
    "Counting the holders",
  ];
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => setShown((n) => (n < lines.length ? n + 1 : n)), 480);
    return () => window.clearInterval(id);
  }, [lines.length]);
  return (
    <div className="mx-auto max-w-md px-3 py-8 sm:px-4" role="status">
      <span className="sr-only">Reading the token…</span>
      <div
        aria-hidden
        className="rounded-lg border border-border bg-bg/85 p-4 font-mono text-[12.5px] shadow-float backdrop-blur-sm"
      >
        {lines.slice(0, shown).map((line, i) => (
          <div key={i} className="boot-line flex gap-2 py-0.5 text-muted">
            <span className="text-subtle">›</span>
            <span className="min-w-0 flex-1">{line}</span>
          </div>
        ))}
        <p className="mt-1 flex items-center gap-2 text-subtle">
          <Scramble length={12} />
          <span className="caret inline-block h-3.5 w-1.5 bg-fg" />
        </p>
      </div>
    </div>
  );
}

/**
 * A token pasted on Trace: the verdict and the checks behind it, where its buys and sells come from (each wallet
 * a tap from its own trail), who holds it, and who deployed it.
 */
export function TokenReport({ chain: chainId, address }: { chain: string; address: string }) {
  const chain = traceChain(chainId)!;
  const { report, error, loading, reload } = useReport(chainId, address);
  const [link, setLink] = useState("");
  useEffect(() => setLink(window.location.href), []);

  return (
    <div className="space-y-5 pt-8 sm:pt-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="label text-subtle">Token report</span>
          <span className="label text-subtle">· {chainName(chain)}</span>
          <span className="ml-auto flex items-center gap-3">
            {link && <CopyButton value={link} label="Copy link" what="link" />}
          </span>
        </div>
        <h1 className="cine-in text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {report?.symbol ? (
            <>
              ${report.symbol}
              {report.name && <span className="ml-2 text-lg font-normal text-muted sm:text-xl">{report.name}</span>}
            </>
          ) : (
            <FullAddress address={address} decrypt max={30} className="tracking-[-0.02em]" />
          )}
        </h1>
        {report?.symbol && <FullAddress address={address} max={15} className="-mt-1 text-muted" />}
        {chain.kind === "evm" && (
          <nav aria-label="Chain" className="flex flex-wrap gap-1.5">
            {EVM_TRACE_CHAINS.map((c) => (
              <Link
                key={c.id}
                href={traceHref(c.id, address)}
                aria-current={c.id === chain.id ? "page" : undefined}
                className={clsx(
                  "rounded-md border px-2 py-1 font-mono text-[11px] uppercase transition-colors",
                  c.id === chain.id ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg",
                )}
              >
                {c.id}
              </Link>
            ))}
          </nav>
        )}
        <TraceInput />
      </header>

      {error && !report ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
          <p className="text-sm">{error.message}</p>
          {error.code !== "invalid" && error.code !== "unsupported" && error.code !== "private" && (
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              <RotateCcw className="size-3.5" /> Try again
            </button>
          )}
        </div>
      ) : !report ? (
        <ReportBoot chain={chain} address={address} />
      ) : (
        <>
          <dl className="card grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-4 sm:p-5">
            <Stat k="Price">{formatPrice(report.priceUsd)}</Stat>
            <Stat k="Market cap">{formatUsd(report.marketCap)}</Stat>
            <Stat k="Liquidity">{formatUsd(report.liquidityUsd)}</Stat>
            <Stat k="Main pool">
              {report.pool ? (
                <>
                  {report.pool.dex}
                  {report.pool.createdAt && (
                    <span className="text-[12px] text-subtle">
                      {" "}
                      · <TimeAgo at={report.pool.createdAt} compact />
                    </span>
                  )}
                </>
              ) : (
                "—"
              )}
            </Stat>
          </dl>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Verdict report={report} />
            <div className="space-y-4">
              <Flow report={report} />
              <Traders report={report} chain={chain} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Holders report={report} chain={chain} />
            <section className="card p-4 sm:p-5" aria-labelledby="links-title">
              <h2 id="links-title" className="label text-fg">
                Follow the money
              </h2>
              {report.creator ? (
                <div className="mt-3 flex items-start gap-3">
                  <Avatar userId={report.creator} size={32} className="rounded-[7px]" />
                  <div className="min-w-0 flex-1">
                    <p className="label text-subtle">Deployed by</p>
                    <FullAddress address={report.creator} max={12.5} className="mt-0.5" />
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Tap a buyer, a seller or a holder to see where their money came from and where it went.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {report.creator && (
                  <Link
                    href={traceHref(chain.id, report.creator)}
                    className="inline-flex items-center gap-1 rounded-md bg-fg px-3 py-1.5 text-[13px] font-medium text-bg hover:opacity-85"
                  >
                    <Crosshair className="size-3.5" /> Trace the deployer
                  </Link>
                )}
                <Link href={tokenHref({ chainId: chain.id, address })} className={linkClass}>
                  Open on Rankr
                </Link>
                {report.pool && (
                  <a href={report.pool.url} target="_blank" rel="noreferrer" className={linkClass}>
                    DexScreener <ArrowUpRight className="size-3.5" />
                  </a>
                )}
                <a href={explorerAddress(chain, address)} target="_blank" rel="noreferrer" className={linkClass}>
                  Explorer <ArrowUpRight className="size-3.5" />
                </a>
              </div>
              <p className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-[12px] text-subtle">
                Read <TimeAgo at={report.updatedAt} />
                <button
                  type="button"
                  onClick={() => void reload()}
                  disabled={loading}
                  className="inline-flex items-center gap-1 text-muted hover:text-fg disabled:opacity-50"
                >
                  <RotateCcw className={clsx("size-3", loading && "animate-spin")} /> Read again
                </button>
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
