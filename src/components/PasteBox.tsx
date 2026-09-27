"use client";

import clsx from "clsx";
import { ArrowRight, ClipboardPaste, LoaderCircle, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { parseInput } from "@/lib/address";
import { formatDate, formatUsd, tokenHref } from "@/lib/format";
import { trackPaste } from "@/lib/track";
import type { TrackResponse } from "@/lib/types";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ChainTag } from "./Chain";
import { TokenName } from "./TokenList";

type Result = TrackResponse & { firstCallByYou: boolean };

export function PasteBox({ autoFocus, size = "lg" }: { autoFocus?: boolean; size?: "md" | "lg" }) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [canReadClipboard, setCanReadClipboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanReadClipboard(typeof navigator !== "undefined" && !!navigator.clipboard?.readText);
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function submit(raw: string) {
    const input = raw.trim();
    if (!input || loading) return;
    if (!parseInput(input)) {
      setResult(null);
      setError("That doesn't look like a contract address. Paste a CA or a pump.fun / DexScreener link.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await trackPaste(input));
      setValue("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setValue(text);
      void submit(text);
    } catch {
      inputRef.current?.focus();
    }
  }

  const lg = size === "lg";
  const pasteMode = !value && canReadClipboard;

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(value);
        }}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors focus-within:border-border-strong"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onPaste={(e) => {
            // Pasting a valid CA tracks it right away, no extra click.
            const text = e.clipboardData.getData("text").trim();
            if (parseInput(text)) {
              e.preventDefault();
              setValue(text);
              void submit(text);
            }
          }}
          placeholder="Paste a contract address or link"
          aria-label="Token contract address"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className={clsx(
            "min-w-0 flex-1 bg-transparent px-2.5 font-mono tracking-tight outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-subtle",
            lg ? "h-10 text-[15px]" : "h-9 text-sm",
          )}
        />
        {value && !loading && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setError(null);
              inputRef.current?.focus();
            }}
            className="grid size-8 shrink-0 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg"
            aria-label="Clear"
          >
            <X className="size-4" />
          </button>
        )}
        {!value && canReadClipboard && (
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="hidden h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:inline-flex"
          >
            <ClipboardPaste className="size-3.5" />
            Paste
          </button>
        )}
        <button
          type={value ? "submit" : "button"}
          onClick={value ? undefined : pasteMode ? pasteFromClipboard : () => inputRef.current?.focus()}
          disabled={loading}
          className={clsx(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-fg font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-60",
            lg ? "h-10 px-4 text-sm" : "h-9 px-3.5 text-sm",
          )}
        >
          {loading ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              <span className="hidden sm:inline">Sealing</span>
            </>
          ) : pasteMode ? (
            <>
              <ClipboardPaste className="size-4 sm:hidden" />
              <span className="sm:hidden">Paste</span>
              <span className="hidden sm:inline">Track</span>
            </>
          ) : (
            <>
              Track
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>

      {error && (
        <p role="alert" className="animate-fade-in mt-2.5 flex items-start gap-2 text-left text-sm text-down">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {result && <TrackResult result={result} onClose={() => setResult(null)} />}
    </div>
  );
}

function TrackResult({ result, onClose }: { result: Result; onClose: () => void }) {
  const t = result.token;
  const created = result.status === "created";
  return (
    <div role="status" className="animate-fade-in mt-3 overflow-hidden rounded-lg border border-border bg-surface text-left">
      <Link href={tokenHref(t)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
        <div className="min-w-0 flex-1">
          <TokenName symbol={t.symbol} name={t.name} />
          <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
            <ChainTag chainId={t.chainId} /> · entry {formatUsd(t.entryMarketCap)} → now {formatUsd(t.marketCap)}
          </div>
        </div>
        <MultipleBadge multiple={t.multiple} />
      </Link>
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 font-mono text-[11px] text-subtle">
        <span className={clsx("size-1.5 shrink-0 rounded-full", created ? "bg-up" : "bg-subtle")} />
        <span className="min-w-0 flex-1 truncate">
          {created ? (
            <>
              sealed {formatDate(t.firstPastedAt)} · sha256 <span className="text-muted">{t.seal.slice(0, 16)}</span>
            </>
          ) : (
            <>
              already sealed <TimeAgo at={t.firstPastedAt} />
              {result.firstCallByYou ? " · added to your calls" : ""}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 grid size-6 shrink-0 place-items-center rounded hover:bg-surface-2 hover:text-fg"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
