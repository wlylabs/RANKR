"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import type { UsageRow } from "@/lib/budget";
import { useNow } from "@/lib/hooks";
import { authedFetcher } from "@/lib/supabase-browser";
import { PageHeader } from "../PageHeader";

type Usage = { resources: UsageRow[]; at: number };

// How full a budget is, the way usage pages show it (Vercel's, GitHub's rate limit): fine, getting close, near
// the limit, used up. Rankr's colors: green while fine, red near the end.
type Level = "ok" | "close" | "near" | "out";
const level = (r: UsageRow): Level => {
  if (r.remaining <= 0) return "out";
  const share = r.used / r.limit;
  return share >= 0.9 ? "near" : share >= 0.7 ? "close" : "ok";
};
const LEVEL: Record<Level, { label: string; text: string; bar: string; Icon: typeof Check }> = {
  ok: { label: "OK", text: "text-up", bar: "bg-up", Icon: Check },
  close: { label: "Getting close", text: "text-fg", bar: "bg-fg", Icon: CircleAlert },
  near: { label: "Near the limit", text: "text-down", bar: "bg-down", Icon: CircleAlert },
  out: { label: "Used up", text: "text-down", bar: "bg-down", Icon: TriangleAlert },
};

const WINDOW: Record<UsageRow["window"], string> = { minute: "this minute", day: "today (UTC)", month: "this month" };

const n = (v: number) => Math.round(v).toLocaleString("en-US");

/** "42s", "7h 12m", "3d 4h": until `at`. */
function countdown(at: number, now: number): string {
  const s = Math.max(0, Math.ceil((at - now) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function Row({ r, now }: { r: UsageRow; now: number }) {
  const l = LEVEL[level(r)];
  const share = Math.min(100, (r.used / r.limit) * 100);
  return (
    <li className="py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{r.name}</span>
        <span className={clsx("inline-flex items-center gap-1 text-[12.5px]", l.text)}>
          <l.Icon className="size-3.5" /> {l.label}
        </span>
      </div>
      <p className="text-[12.5px] text-subtle">{r.use}</p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label={`${r.name}, ${WINDOW[r.window]}`}
        aria-valuemin={0}
        aria-valuemax={r.limit}
        aria-valuenow={r.used}
      >
        <span className={clsx("block h-full", l.bar)} style={{ width: `${Math.max(share, r.used ? 1 : 0)}%` }} />
      </div>
      <div className="tabular mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-mono text-[12px]">
        <span>
          {n(r.used)} <span className="text-subtle">/ {n(r.limit)} {r.unit} {WINDOW[r.window]}</span>
          {r.id.startsWith("blockscout") && <span className="text-subtle"> · ≈ {n(r.used / 20)} requests</span>}
        </span>
        <span className="text-muted">
          {n(r.remaining)} left{r.used > 0 && <> · resets in {countdown(r.reset, now)}</>}
        </span>
      </div>
    </li>
  );
}

function Section({ title, note, rows, now }: { title: string; note: string; rows: UsageRow[]; now: number }) {
  if (!rows.length) return null;
  return (
    <section className="card px-4 sm:px-5" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border py-3">
        <h2 className="label text-fg">{title}</h2>
        <span className="text-[12px] text-subtle">{note}</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <Row key={`${r.id}:${r.window}`} r={r} now={now} />
        ))}
      </ul>
    </section>
  );
}

/**
 * How much of each free API's limit Rankr has used, and when it starts over: a bar per budget, fine to used up,
 * with what's left and a countdown (after GitHub's /rate_limit: limit, used, remaining, reset). Live: read every
 * 10 seconds, the countdowns every second.
 */
export function UsageView() {
  const { data, error } = useSWR<Usage>("/api/trace/usage", authedFetcher, { refreshInterval: 10_000 });
  const now = useNow(1_000);
  const live = data?.resources.filter((r) => !r.off) ?? [];
  const off = data?.resources.filter((r) => r.off) ?? [];
  const out = live.filter((r) => level(r) === "out");
  const near = live.filter((r) => level(r) === "near" || level(r) === "close");
  const names = (rows: UsageRow[]) => [...new Set(rows.map((r) => r.name))].join(", ");

  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-8 sm:pt-10">
      <Link href="/trace" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Trace
      </Link>
      <PageHeader title="API usage">
        Rankr keeps under each free API&apos;s limit: a call its budget can&apos;t cover isn&apos;t made, and a report
        says what it skipped. Live, read every 10 seconds.
      </PageHeader>

      {error ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm">{error.message}</p>
      ) : !data ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface-2/60" aria-busy />
      ) : (
        <>
          <p
            className={clsx(
              "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm",
              out.length ? "border-down/40 bg-down-soft text-down" : near.length ? "border-border-strong" : "border-up/40 bg-up-soft text-up",
            )}
          >
            {out.length ? (
              <>
                <TriangleAlert className="size-4 shrink-0" /> Used up: {names(out)}. Those parts are skipped until it
                resets.
              </>
            ) : near.length ? (
              <>
                <CircleAlert className="size-4 shrink-0" /> Getting close: {names(near)}.
              </>
            ) : (
              <>
                <Check className="size-4 shrink-0" /> Every API is within its limit.
              </>
            )}
          </p>

          <Section
            title="Today and this month"
            note="Every server together"
            rows={live.filter((r) => r.scope === "shared")}
            now={now}
          />
          <Section
            title="This minute"
            note="This server (the APIs count per IP)"
            rows={live.filter((r) => r.scope === "instance")}
            now={now}
          />
          {off.length > 0 && (
            <ul className="space-y-1 px-1 text-[12.5px] text-subtle">
              {off.map((r) => (
                <li key={r.id}>
                  <span className="text-muted">{r.name}</span> · {r.off}
                </li>
              ))}
            </ul>
          )}

          <p className="px-1 text-[12px] leading-relaxed text-subtle">
            Rankr&apos;s own count of what it asked for (a shared day&apos;s or month&apos;s count includes small blocks
            servers have reserved). Each provider&apos;s own count is on its dashboard:{" "}
            <a href="https://dashboard.helius.dev" target="_blank" rel="noreferrer" className="inline-flex items-center underline">
              Helius <ArrowUpRight className="size-3" />
            </a>
            ,{" "}
            <a href="https://dev.blockscout.com" target="_blank" rel="noreferrer" className="inline-flex items-center underline">
              Blockscout <ArrowUpRight className="size-3" />
            </a>
            . The limits are set in the environment (README, Usage limits).
          </p>
        </>
      )}
    </div>
  );
}
