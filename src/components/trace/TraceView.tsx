"use client";

import clsx from "clsx";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tokenHref } from "@/lib/format";
import { sha256Hex } from "@/lib/sha256";
import { EVM_TRACE_CHAINS, traceChain, traceHref } from "@/lib/trace/chains";
import { dataOf, parentId } from "@/lib/trace/tree";
import type { TraceErrorCode, TraceResponse } from "@/lib/trace/types";
import { CopyButton } from "../CopyButton";
import { DecryptText } from "../DecryptText";
import { CaseFile } from "./CaseFile";
import { Inspector } from "./Inspector";
import { FullAddress } from "./TraceCard";
import { TracePath } from "./TracePath";
import { ShareTrace } from "./ShareTrace";
import { TraceInput } from "./TraceInput";
import { useTrail } from "./useTrail";

type ReadError = { message: string; code?: TraceErrorCode };

/** Reads wallets for the trail, each once (until it fails and is asked for again). */
function useWallets(chain: string) {
  const [data, setData] = useState<Map<string, TraceResponse>>(() => new Map());
  const [errors, setErrors] = useState<Map<string, ReadError>>(() => new Map());
  const inflight = useRef(new Set<string>());

  const load = useCallback(
    async (address: string) => {
      if (inflight.current.has(address)) return;
      inflight.current.add(address);
      setErrors((m) => {
        if (!m.has(address)) return m;
        const next = new Map(m);
        next.delete(address);
        return next;
      });
      try {
        const res = await fetch(`/api/trace/${chain}/${encodeURIComponent(address)}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const error: ReadError = { message: body?.error ?? `Request failed (${res.status})`, code: body?.code };
          setErrors((m) => new Map(m).set(address, error));
        } else {
          setData((m) => new Map(m).set(address, body as TraceResponse));
        }
      } catch {
        setErrors((m) => new Map(m).set(address, { message: "Couldn't reach Rankr. Check your connection." }));
      } finally {
        inflight.current.delete(address);
      }
    },
    [chain],
  );

  return { data, errors, load };
}

/** Why the target can't be traced, and what to do instead. */
function RootError({
  chain,
  address,
  error,
  onRetry,
}: {
  chain: string;
  address: string;
  error: ReadError;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
      <p className="text-sm">{error.message}</p>
      <div className="mt-4 flex justify-center gap-2">
        {error.code === "token" ? (
          <Link
            href={tokenHref({ chainId: chain, address })}
            className="inline-flex items-center gap-1 rounded-md bg-fg px-3 py-1.5 text-sm font-medium text-bg"
          >
            Open the token <ArrowUpRight className="size-3.5" />
          </Link>
        ) : error.code === "nokey" ||
          error.code === "unsupported" ||
          error.code === "invalid" ||
          error.code === "program" ? null : (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            <RotateCcw className="size-3.5" /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A wallet's trail as one line of cards: who sent it money (above), the wallet, where its money went (below),
 * as deep as you follow it; the card you pick in full, and the case file of what it all says.
 */
export function TraceView({ chain: chainId, address }: { chain: string; address: string }) {
  const chain = traceChain(chainId)!;
  const { data, errors, load } = useWallets(chainId);
  const [link, setLink] = useState("");
  const details = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load(address);
    setLink(window.location.href);
  }, [address, load]);

  const messages = useMemo(() => new Map([...errors].map(([a, e]) => [a, e.message])), [errors]);
  const read = useCallback((a: string) => void load(a), [load]);
  const { items, steps, picked, toggle, pick, follow, select } = useTrail(address, data, messages, read);

  const root = dataOf(data, address) ?? null;
  const rootError = !root ? errors.get(address) : undefined;
  const pickedParent = parentId(picked.id);
  const caseId = useMemo(() => sha256Hex(`${chainId}:${address}`).slice(0, 8), [chainId, address]);

  return (
    <div className="space-y-5 pt-8 sm:pt-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="label text-subtle">Case #{caseId}</span>
          <span className="label text-subtle">· {chain.id === "solana" ? "Solana" : chain.id}</span>
          <span className="ml-auto flex items-center gap-3">
            {link && <CopyButton value={link} label="Copy link" what="link" />}
            {root && <ShareTrace chain={chain} root={root} data={data} steps={steps} caseId={caseId} />}
          </span>
        </div>
        {/* Its name when a list knows it, and always its whole address, on one line. */}
        <h1 className="cine-in text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {root?.label ? (
            <DecryptText text={root.label.name} className="font-mono tracking-[-0.04em]" />
          ) : (
            <FullAddress address={address} decrypt max={30} className="tracking-[-0.02em]" />
          )}
        </h1>
        {root?.label && <FullAddress address={address} max={15} className="-mt-1 text-muted" />}
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

      {rootError ? (
        <RootError chain={chainId} address={address} error={rootError} onRetry={() => void load(address)} />
      ) : (
        <>
          <p className="label flex flex-wrap gap-x-4 gap-y-1 text-subtle">
            <span>↓ Money flows down</span>
            <span>Follow: one hop further · Switch: another wallet</span>
            <span className="text-down">Red: flagged on a public list</span>
          </p>
          <TracePath
            steps={steps}
            items={items}
            root={root}
            chain={chain}
            selected={picked.id}
            onSelect={(item) => {
              select(item.id);
              // Its details are under the path: brought up on a phone, where they're out of sight.
              requestAnimationFrame(() => details.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
            }}
            onFollow={follow}
            onPick={pick}
            onRetry={(a) => void load(a)}
            header={
              <>
                <span className="label min-w-0 flex-1 truncate text-subtle">Case #{caseId} · following the money</span>
                {root && (
                  <ShareTrace chain={chain} root={root} data={data} steps={steps} caseId={caseId} variant="icon" />
                )}
              </>
            }
          />
          {root && (
            <div ref={details} className="grid scroll-my-20 gap-4 lg:grid-cols-2">
              <Inspector
                chain={chain}
                item={picked}
                parent={pickedParent ? (items.get(pickedParent)?.address ?? null) : null}
                data={picked.address ? dataOf(data, picked.address) : undefined}
                onToggle={() => toggle(picked)}
              />
              <CaseFile root={root} data={data} caseId={caseId} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
