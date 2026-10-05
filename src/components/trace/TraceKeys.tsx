"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowUpRight, Check, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, authedFetcher } from "@/lib/supabase-browser";
import type { TraceKeysResponse } from "@/lib/types";
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
 * Your own API keys for Trace: every account traces on keys of its own, never on Rankr's, each within its own
 * free plan. Saved encrypted, shown by their last characters only.
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
        Trace reads the chains on your own keys: free from each provider, and only yours. Rankr keeps them
        encrypted and only ever shows their last characters.
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
      )}
    </div>
  );
}

/** On the trace page, for an account missing a key: what it can't trace yet, and where to add one. */
export function KeysNote() {
  const { data } = useTraceKeys();
  if (!data || data.official || !data.storable || (data.helius && data.blockscout)) return null;
  const missing = [!data.helius && "Solana (Helius)", !data.blockscout && "EVM chains (Blockscout)"].filter(Boolean);
  return (
    <Link
      href="/trace/keys"
      className="flex items-start gap-2 rounded-xl border border-border-strong px-4 py-3 text-sm hover:bg-surface-2"
    >
      <KeyRound className="mt-0.5 size-4 shrink-0" />
      <span>
        Trace runs on your own free API keys. Add one for {missing.join(" and ")}{" "}
        <span className="text-muted">→</span>
      </span>
    </Link>
  );
}

/** To /trace/keys, for a read that needs a key the account hasn't added. */
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
