"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowUpRight, Check, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, authedFetcher } from "@/lib/supabase-browser";
import type { TraceAllowance, TraceKeysResponse } from "@/lib/types";
import { PageHeader } from "../PageHeader";

export const KEYS_URL = "/api/me/trace-keys";

/** The account's own Trace keys (null while they're read). */
export function useTraceKeys() {
  return useSWR<TraceKeysResponse>(KEYS_URL, authedFetcher, { revalidateOnFocus: false });
}

const FIELD =
  "flex h-11 items-center rounded-lg border border-border bg-surface px-3 transition-colors focus-within:border-border-strong has-[[aria-invalid=true]]:border-down/60";
const PRIMARY =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-fg px-3.5 text-sm font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50";
const SECONDARY =
  "inline-flex h-9 items-center justify-center rounded-md border border-border px-3.5 text-sm transition-colors hover:bg-surface-2 disabled:opacity-50";

const PROVIDERS = {
  helius: {
    name: "Helius",
    chains: "Solana",
    signup: "https://dashboard.helius.dev",
    free: "Free plan: 1M credits a month, 10 requests a second.",
    placeholder: "Your Helius API key (or its RPC URL)",
  },
  blockscout: {
    name: "Blockscout",
    chains: "Ethereum, Base, Arbitrum, Optimism, Polygon and Robinhood Chain",
    signup: "https://dev.blockscout.com",
    free: "Free plan: 100K credits a day.",
    placeholder: "Your Blockscout API key",
  },
} as const;

type Name = keyof typeof PROVIDERS;

/** One provider's key: which one is saved (its end only), and a box to add, replace or remove it. */
function KeyRow({ name, saved, onSaved }: { name: Name; saved: string | null; onSaved: (v: TraceKeysResponse) => void }) {
  const p = PROVIDERS[name];
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(key: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(KEYS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [name]: key }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
      onSaved(body as TraceKeysResponse);
      setValue("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const id = `key-${name}`;
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <label htmlFor={id} className="font-medium">
          {p.name} <span className="text-[12.5px] font-normal text-subtle">· {p.chains}</span>
        </label>
        <span className={clsx("inline-flex items-center gap-1 text-[12.5px]", saved ? "text-up" : "text-subtle")}>
          {saved ? (
            <>
              <Check className="size-3.5" /> Saved <span className="font-mono">{saved}</span>
            </>
          ) : (
            "Not added"
          )}
        </span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() && !busy) void send(value.trim());
        }}
        className="flex flex-wrap gap-2"
      >
        <div className={clsx(FIELD, "min-w-0 flex-1 basis-64")}>
          <input
            id={id}
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby={`${id}-hint`}
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            placeholder={saved ? "Paste a new key to replace it" : p.placeholder}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-subtle/60"
          />
        </div>
        <button type="submit" disabled={busy || !value.trim()} className={PRIMARY}>
          {busy && <LoaderCircle className="size-3.5 animate-spin" />}
          {saved ? "Replace" : "Save"}
        </button>
        {saved && (
          <button type="button" disabled={busy} onClick={() => void send(null)} className={SECONDARY}>
            Remove
          </button>
        )}
      </form>
      <p id={`${id}-hint`} className={clsx("text-xs", error ? "text-down" : "text-subtle")}>
        {error ?? (
          <>
            {p.free}{" "}
            <a href={p.signup} target="_blank" rel="noreferrer" className="inline-flex items-center underline">
              Get a key <ArrowUpRight className="size-3" />
            </a>
          </>
        )}
      </p>
    </li>
  );
}

/**
 * Your own API keys for Trace, and today's free reads: a chain without a key of yours reads on Rankr's keys, a few
 * wallets and reports a day; with one, as much as its own free plan allows. Saved encrypted, shown by their last
 * characters only.
 */
export function TraceKeys() {
  const { data, error, mutate } = useTraceKeys();
  const onSaved = (v: TraceKeysResponse) => void mutate(v, { revalidate: false });

  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-8 sm:pt-10">
      <Link href="/trace" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Trace
      </Link>
      <PageHeader title="Your API keys">
        Every account gets a few free reads a day on Rankr&apos;s keys. Add your own (free from each provider) to
        trace as much as you like: they&apos;re only yours, kept encrypted, and only their last characters are shown.
      </PageHeader>

      {error ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm">{error.message}</p>
      ) : !data ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface-2/60" aria-busy />
      ) : data.official ? (
        <p className="flex items-center gap-2 rounded-xl border border-up/40 bg-up-soft px-4 py-3 text-sm text-up">
          <Check className="size-4 shrink-0" /> This is an official account: it traces on Rankr&apos;s own keys.
        </p>
      ) : !data.storable ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm">
          Saving keys isn&apos;t set up on this site yet.
        </p>
      ) : (
        <>
          {data.free && <FreeReads free={data.free} />}
          <section className="card px-4 sm:px-5" aria-label="Keys">
            <div className="flex items-center gap-2 border-b border-border py-3">
              <KeyRound className="size-3.5 text-subtle" />
              <h2 className="label text-fg">One per provider</h2>
            </div>
            <ul className="divide-y divide-border">
              <KeyRow name="helius" saved={data.helius} onSaved={onSaved} />
              <KeyRow name="blockscout" saved={data.blockscout} onSaved={onSaved} />
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

const left = (r: { used: number; limit: number }) => Math.max(0, r.limit - r.used);

/** Today's free reads: how many wallets and reports are left, and when they come back. */
function FreeReads({ free }: { free: TraceAllowance }) {
  const rows = [
    ["Wallets", free.wallets],
    ["Token reports", free.reports],
  ] as const;
  return (
    <section className="card px-4 sm:px-5" aria-label="Free reads today">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border py-3">
        <h2 className="label text-fg">Free reads today</h2>
        <span className="text-[12px] text-subtle">Back at 00:00 UTC · for chains without a key of yours</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map(([name, r]) => (
          <li key={name} className="flex items-baseline justify-between gap-3 py-3 text-sm">
            <span>{name}</span>
            <span className="tabular font-mono text-[12.5px]">
              {left(r)} <span className="text-subtle">/ {r.limit} left</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border py-3 text-[12px] text-subtle">
        A wallet anyone has opened lately is free: it comes from Rankr&apos;s shared reads.
        {free.guest && " Save a sign-in key (Account) for more free reads."}
      </p>
    </section>
  );
}

/** On the trace page, for an account missing a key: its free reads left today, and where to add a key. */
export function KeysNote() {
  const { data } = useTraceKeys();
  if (!data || data.official || !data.free || (data.helius && data.blockscout)) return null;
  const { wallets, reports } = data.free;
  return (
    <Link
      href="/trace/keys"
      className="flex items-start gap-2 rounded-xl border border-border-strong px-4 py-3 text-sm hover:bg-surface-2"
    >
      <KeyRound className="mt-0.5 size-4 shrink-0" />
      <span>
        Free today: {left(wallets)} wallets and {left(reports)} token reports left.{" "}
        <span className="text-muted">Add your own free API key for unlimited tracing →</span>
      </span>
    </Link>
  );
}

/** To /trace/keys, for a read that needs a key the account hasn't added (or its free reads are spent). */
export function KeysLink() {
  return (
    <Link
      href="/trace/keys"
      className="inline-flex items-center gap-1.5 rounded-md bg-fg px-3 py-1.5 text-sm font-medium text-bg hover:opacity-85"
    >
      <KeyRound className="size-3.5" /> Add your API key
    </Link>
  );
}
