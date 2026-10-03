"use client";

import clsx from "clsx";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Crosshair,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatCount, formatUsd, tokenHref } from "@/lib/format";
import { apiFetch } from "@/lib/supabase-browser";
import {
  EVM_TRACE_CHAINS,
  chainLabel,
  explorerAddress,
  traceChain,
  traceHref,
  type TraceChain,
} from "@/lib/trace/chains";
import type {
  TokenCheck,
  TokenCheckStatus,
  TokenGroup,
  TokenReport as Report,
  TokenTrader,
  TokenVerdict,
  TokenWindow,
} from "@/lib/trace/types";
import { Avatar } from "../Avatar";
import { CopyButton } from "../CopyButton";
import { Segmented } from "../Tabs";
import { TimeAgo } from "../TimeAgo";
import { FullAddress, LabelTag, Scramble } from "./TraceCard";
import { TraceInput } from "./TraceInput";

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

const chainName = chainLabel;

/** "42 min", "3.5h", "1 day". */
function span(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = ms / 3_600_000;
  return h < 24 ? `${h < 10 ? h.toFixed(1) : Math.round(h)}h` : "1 day";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "A", "A and B", "A, B and C". */
const andList = (names: string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// ---- Status, the same marks everywhere: red for a warning sign, a ring to check, grey unread, green fine.

const VERDICT: Record<TokenVerdict, { title: string; box: string; text: string; Icon: typeof Check }> = {
  danger: { title: "Warning signs", box: "border-down/40 bg-down-soft", text: "text-down", Icon: TriangleAlert },
  check: { title: "Worth a closer look", box: "border-border-strong bg-surface-2/60", text: "text-fg", Icon: CircleAlert },
  clear: { title: "No warning signs", box: "border-up/40 bg-up-soft", text: "text-up", Icon: Check },
};

const STATUS: Record<TokenCheckStatus, { Icon: typeof Check; className: string; label: string }> = {
  bad: { Icon: TriangleAlert, className: "text-down", label: "Warning sign" },
  warn: { Icon: CircleAlert, className: "text-fg", label: "Worth a look" },
  unknown: { Icon: CircleHelp, className: "text-subtle", label: "Not read" },
  ok: { Icon: Check, className: "text-up", label: "Fine" },
};
const RANK: Record<TokenCheckStatus, number> = { bad: 0, warn: 1, unknown: 2, ok: 3 };

const GROUPS: [TokenGroup, string][] = [
  ["contract", "Contract"],
  ["liquidity", "Liquidity"],
  ["holders", "Holders"],
  ["insiders", "Launch & insiders"],
  ["trading", "Trading"],
];

/** A few checks' short words, worst first: "Can be frozen · 35% bundled". */
const shorts = (checks: TokenCheck[], n: number) => {
  const picked = checks.slice(0, n).map((c) => c.short);
  return checks.length > n ? [...picked, `+${checks.length - n} more`] : picked;
};

function Dots({ items, className }: { items: string[]; className?: string }) {
  return (
    <span className={className}>
      {items.map((t, i) => (
        <span key={i}>
          {i > 0 && <span className="text-subtle"> · </span>}
          {t}
        </span>
      ))}
    </span>
  );
}

/** The verdict, and in a line what it rests on. */
function Verdict({ report }: { report: Report }) {
  const v = VERDICT[report.verdict];
  const by = (s: TokenCheckStatus[]) => report.checks.filter((c) => s.includes(c.status));
  const reasons = report.verdict === "danger" ? by(["bad"]) : report.verdict === "check" ? by(["warn", "unknown"]) : by(["ok"]);
  const bad = by(["bad"]).length;
  const look = by(["warn", "unknown"]).length;
  const fine = by(["ok"]).length;
  return (
    <section className={clsx("rounded-xl border px-4 py-4 sm:px-5", v.box)} aria-labelledby="verdict-title">
      <h2 id="verdict-title" className={clsx("flex items-center gap-2 text-xl font-semibold tracking-[-0.02em]", v.text)}>
        <v.Icon className="size-5 shrink-0" />
        {v.title}
      </h2>
      <p className="mt-1.5 text-[15px] text-pretty">
        <Dots items={shorts(reasons, report.verdict === "clear" ? 4 : 3)} />
      </p>
      <p className="label mt-2 text-subtle">
        {[bad && plural(bad, "warning sign"), look && `${look} to check`, fine && `${fine} fine`].filter(Boolean).join(" · ")}
      </p>
    </section>
  );
}

/** The five areas, one line each: its worst finding in a few words. Tap one for every check behind it. */
function Areas({ report }: { report: Report }) {
  return (
    <section className="card divide-y divide-border" aria-label="What was checked">
      {GROUPS.map(([group, title]) => {
        const checks = report.checks
          .filter((c) => c.group === group)
          .sort((a, b) => RANK[a.status] - RANK[b.status]);
        const notes = report.notes.filter((n) => n.group === group);
        if (!checks.length && !notes.length) return null;
        const worst = checks[0]?.status ?? "unknown";
        const s = STATUS[worst];
        const top = checks.filter((c) => c.status === worst);
        return (
          <details key={group} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
              <s.Icon className={clsx("size-4 shrink-0", s.className)} aria-label={s.label} />
              {/* On a phone the finding goes under the area's name; from sm up, beside it. */}
              <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
                <span className="block text-sm font-medium sm:w-36 sm:shrink-0">{title}</span>
                <Dots items={shorts(top, 2)} className="block min-w-0 text-[13px] text-muted sm:truncate sm:text-sm" />
              </span>
              <ChevronDown className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" />
            </summary>
            <ul className="space-y-2 px-4 pb-4 sm:px-5 sm:pl-12">
              {checks.map((c) => {
                const cs = STATUS[c.status];
                return (
                  <li key={c.id} className="flex gap-2.5 text-sm">
                    <cs.Icon className={clsx("mt-0.5 size-3.5 shrink-0", cs.className)} aria-label={cs.label} />
                    <span className="min-w-0 text-pretty">
                      {c.text}
                      {c.source && <span className="text-[12px] text-subtle"> · {c.source}</span>}
                    </span>
                  </li>
                );
              })}
              {notes.map((n) => (
                <li key={n.text} className="flex gap-2.5 text-[13px] text-subtle">
                  <CircleHelp className="mt-0.5 size-3.5 shrink-0" />
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

const WINDOW_LABELS: Record<TokenWindow, string> = { "5m": "5m", "1h": "1h", "6h": "6h", "24h": "24h" };

function TraderRow({ chain, t, side }: { chain: TraceChain; t: TokenTrader; side: "buy" | "sell" }) {
  const net = side === "buy" ? t.buyUsd - t.sellUsd : t.sellUsd - t.buyUsd;
  return (
    <li className="flex items-center gap-2.5 py-2">
      <Avatar userId={t.address} size={24} className="rounded-[6px]" />
      <div className="min-w-0 flex-1">
        <FullAddress address={t.address} max={12} />
        <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[11.5px] text-subtle">
          {t.label && <LabelTag label={t.label} className="min-w-0" />}
          <span className="shrink-0">
            {plural(t.buys, "buy")} · {plural(t.sells, "sell")} · <TimeAgo at={t.last} compact />
          </span>
          <span
            className={clsx("tabular ml-auto shrink-0 font-mono text-[13px]", side === "buy" ? "text-up" : "text-down")}
          >
            {side === "buy" ? "+" : "−"}
            {formatUsd(net)}
          </span>
        </p>
      </div>
      <Link
        href={traceHref(chain.id, t.address)}
        className="grid size-8 shrink-0 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg"
        aria-label="Follow this wallet's money"
        title="Follow this wallet's money"
      >
        <Crosshair className="size-3.5" />
      </Link>
    </li>
  );
}

/** Buys against sells in a window, then who is buying and who is selling, each a tap from its own trail. */
function MoneyFlow({ report, chain }: { report: Report; chain: TraceChain }) {
  const [win, setWin] = useState<TokenWindow>("1h");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const w = report.flow.find((f) => f.window === win)!;
  const total = w.buys + w.sells;
  const t = report.trades;
  const list = t ? (side === "buy" ? t.buyers : t.sellers) : [];
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="flow-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="flow-title" className="label text-fg">
          Money flow
        </h2>
        <Segmented label="Window" options={WINDOW_LABELS} value={win} onChange={setWin} optionClassName="px-2.5 text-xs" />
      </div>
      <div className="tabular mt-4 flex items-baseline justify-between gap-3 font-mono">
        <span className="text-up">
          <span className="text-lg">{formatCount(w.buys)}</span> <span className="text-[12px]">buys</span>
        </span>
        <span className="text-down">
          <span className="text-[12px]">sells</span> <span className="text-lg">{formatCount(w.sells)}</span>
        </span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {total > 0 && (
          <>
            <span className="bg-up" style={{ width: `${(w.buys / total) * 100}%` }} />
            <span className="flex-1 bg-down" />
          </>
        )}
      </div>
      <p className="mt-1.5 text-[12px] text-subtle">
        {[
          w.buyers !== null && w.sellers !== null && `${formatCount(w.buyers)} buyers · ${formatCount(w.sellers)} sellers`,
          w.volumeUsd !== null && `${formatUsd(w.volumeUsd)} traded`,
        ]
          .filter(Boolean)
          .join(" · ") || "No trades in this window"}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <h3 className="label text-fg">Who&apos;s {side === "buy" ? "buying" : "selling"}</h3>
        <Segmented
          label="Side"
          options={{ buy: "Buyers", sell: "Sellers" }}
          value={side}
          onChange={setSide}
          optionClassName="px-2.5 text-xs"
        />
      </div>
      {!t ? (
        <p className="mt-3 text-sm text-muted">
          {report.pool ? "Couldn't read the latest trades right now." : "No pool trades it yet."}
        </p>
      ) : list.length ? (
        <ul className="mt-1 divide-y divide-border">
          {list.slice(0, 5).map((x) => (
            <TraderRow key={x.address} chain={chain} t={x} side={side} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No net {side === "buy" ? "buyers" : "sellers"} in the latest trades.</p>
      )}
      {t && (
        <p className="mt-2 text-[11px] text-subtle">
          Net, from the latest {t.count} trades ({span(t.to - t.from)}): {formatUsd(t.buyUsd)} in, {formatUsd(t.sellUsd)}{" "}
          out ·{" "}
          <a href="https://www.geckoterminal.com" target="_blank" rel="noreferrer" className="underline">
            powered by GeckoTerminal
          </a>
        </p>
      )}
    </section>
  );
}

const ROLE: Record<"pool" | "burn" | "creator", string> = { pool: "Pool", burn: "Burn", creator: "Dev" };
const CLUSTER = "ABCDEFGH";

/** The biggest holders as bars: pools, burns and the deployer marked, wallets sharing a funder lettered. */
function Holders({ report, chain }: { report: Report; chain: TraceChain }) {
  const [all, setAll] = useState(false);
  const h = report.holders;
  if (!h) return null;
  const shown = all ? h.top : h.top.slice(0, 6);
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="holders-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="holders-title" className="label text-fg">
          Holders
        </h2>
        <span className="label text-subtle">
          {(!h.rough || h.top10Pct > 0) && <>Top 10 · {h.top10Pct.toFixed(1)}%</>}
          {h.count !== null && <> · {formatCount(h.count)} holders</>}
        </span>
      </div>
      {h.rough && (
        <p className="mt-2 text-[12.5px] text-muted">
          Counted by {h.source}: the list itself isn&apos;t read on {chainName(chain)}, and its top 10 may count pools
          in.
        </p>
      )}
      <ol className="mt-3 space-y-2.5">
        {shown.map((x) => (
          <li key={x.address} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            {/* The address on a line of its own, whole; what it is beside its bar. */}
            <Link href={traceHref(chain.id, x.address)} className="min-w-0 hover:underline" title="Trace this wallet">
              <FullAddress address={x.address} max={11.5} className="text-muted" />
            </Link>
            <span className="tabular row-span-2 self-center font-mono text-[13px]">{x.pct.toFixed(x.pct >= 10 ? 1 : 2)}%</span>
            <div className="flex min-w-0 items-center gap-1.5">
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
              {x.cluster !== undefined && (
                <span
                  className="shrink-0 rounded-[3px] bg-down px-1 font-mono text-[9.5px] leading-[15px] tracking-wide text-bg uppercase"
                  title="Shares a funder with other top holders"
                >
                  Linked {CLUSTER[x.cluster] ?? ""}
                </span>
              )}
              {x.label && !x.role && <LabelTag label={x.label} className="max-w-[45%] shrink-0 text-[12px]" />}
              <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <span
                  className={clsx("block h-full", x.role ? "bg-border-strong" : x.cluster !== undefined ? "bg-down" : "bg-fg")}
                  style={{ width: `${Math.min(100, x.pct)}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
      {h.top.length > 6 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-3 text-[13px] text-muted hover:text-fg"
        >
          {all ? "Show fewer" : `Show all ${h.top.length}`}
        </button>
      )}
      {report.clusters.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3 text-[12.5px] text-muted">
          {report.clusters.map((c, i) => (
            <li key={c.funder} className="min-w-0">
              <p>
                <span className="font-mono text-down">Linked {CLUSTER[i] ?? ""}</span> ·{" "}
                {plural(c.members.length, "wallet")} holding {c.pct.toFixed(1)}%,{" "}
                {c.deployer ? "tied to the deployer" : "all first funded by"}
              </p>
              {!c.deployer && (
                <Link href={traceHref(chain.id, c.funder)} className="block min-w-0 hover:underline" title="Trace the funder">
                  <FullAddress address={c.funder} max={11} />
                </Link>
              )}
            </li>
          ))}
        </ul>
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
    "Reading its pools and trades",
    "Checking the contract",
    "Counting the holders",
    "Reading its launch",
    "Finding who funded the holders",
  ];
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => setShown((n) => (n < lines.length ? n + 1 : n)), 900);
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

const linkClass =
  "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-fg";

/**
 * A token pasted on Trace, kept to what helps decide: the verdict and why in a line, the five areas it rests on
 * (tap one for every check), where the money is flowing, and who holds it.
 */
export function TokenReport({ chain: chainId, address }: { chain: string; address: string }) {
  const chain = traceChain(chainId)!;
  const { report, error, loading, reload } = useReport(chainId, address);
  const [link, setLink] = useState("");
  useEffect(() => setLink(window.location.href), []);

  const facts = report
    ? [
        report.marketCap !== null && `${formatUsd(report.marketCap)} mc`,
        report.liquidityUsd !== null && `${formatUsd(report.liquidityUsd)} liquidity`,
        report.pool?.dex,
      ].filter((x): x is string => !!x)
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-8 sm:pt-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="label text-subtle">Token report · {chainName(chain)}</span>
          <span className="ml-auto">{link && <CopyButton value={link} label="Copy link" what="link" />}</span>
        </div>
        <div>
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
          {report?.symbol && <FullAddress address={address} max={14} className="mt-0.5 text-muted" />}
          {facts.length > 0 && (
            <p className="mt-1.5 text-[13px] text-muted">
              <Dots items={facts} />
              {report?.pool?.createdAt && (
                <>
                  <span className="text-subtle"> · </span>opened <TimeAgo at={report.pool.createdAt} />
                </>
              )}
            </p>
          )}
        </div>
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
          <Verdict report={report} />
          {report.skipped.length > 0 && (
            <p className="flex gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted">
              <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-subtle" />
              <span>
                Some parts weren&apos;t read, to stay within the free limits of {andList(report.skipped)}. Read again in a
                minute (a daily limit comes back at 00:00 UTC).
              </span>
            </p>
          )}
          <Areas report={report} />
          <MoneyFlow report={report} chain={chain} />
          <Holders report={report} chain={chain} />

          <section className="flex flex-wrap items-center gap-2 pt-1" aria-label="Links">
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
          </section>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-subtle">
            <span>
              Read <TimeAgo at={report.updatedAt} />
            </span>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              className="inline-flex items-center gap-1 text-muted hover:text-fg disabled:opacity-50"
            >
              <RotateCcw className={clsx("size-3", loading && "animate-spin")} /> Read again
            </button>
            <span>· Facts from public data, not proof of a scam; no warning signs isn&apos;t a promise. Not financial advice.</span>
          </p>
        </>
      )}
    </div>
  );
}
