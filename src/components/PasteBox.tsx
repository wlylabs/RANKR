"use client";

import clsx from "clsx";
import { ArrowRight, ClipboardPaste, LoaderCircle, Lock, Search, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { parseInput } from "@/lib/address";
import { formatDate, formatUsd, tokenHref } from "@/lib/format";
import { trackPaste } from "@/lib/track";
import type { TrackResponse } from "@/lib/types";
import { MultipleBadge } from "./MultipleBadge";
import { TimeAgo } from "./TimeAgo";
import { ChainBadge, TokenAvatar } from "./TokenAvatar";

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
        className={clsx(
          "group flex items-center gap-2 rounded-2xl border border-border bg-surface p-1.5 shadow-[0_1px_0_rgb(0_0_0/0.02),0_12px_40px_-12px_rgb(0_0_0/0.25)] transition focus-within:border-ring/70 focus-within:ring-4 focus-within:ring-ring/15",
          lg && "sm:p-2",
        )}
      >
        <Search className={clsx("ml-2 shrink-0 text-subtle", lg ? "size-5" : "size-4")} aria-hidden />
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
          placeholder="Paste a token CA or link"
          aria-label="Token contract address"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className={clsx(
            "min-w-0 flex-1 bg-transparent font-mono tracking-tight outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-subtle",
            lg ? "h-11 text-[15px] sm:h-12 sm:text-base" : "h-10 text-sm",
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
            className="grid size-8 shrink-0 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg"
            aria-label="Clear"
          >
            <X className="size-4" />
          </button>
        )}
        {!value && canReadClipboard && (
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="hidden h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg sm:inline-flex"
          >
            <ClipboardPaste className="size-4" />
            Paste
          </button>
        )}
        <button
          type={value ? "submit" : "button"}
          onClick={value ? undefined : pasteMode ? pasteFromClipboard : () => inputRef.current?.focus()}
          disabled={loading}
          className={clsx(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand font-semibold text-brand-fg transition hover:opacity-90 active:scale-[0.98] disabled:opacity-70",
            lg ? "h-11 px-4 sm:h-12 sm:px-5" : "h-10 px-3.5 text-sm",
          )}
        >
          {loading ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              <span className="hidden sm:inline">Tracking</span>
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
        <p role="alert" className="animate-pop-in mt-3 flex items-start gap-2 rounded-xl bg-down-soft px-3 py-2.5 text-sm text-down">
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
    <div
      role="status"
      className="animate-pop-in mt-3 overflow-hidden rounded-2xl border border-border bg-surface text-left"
    >
      <div
        className={clsx(
          "flex items-center gap-2 px-4 py-2 text-xs font-semibold",
          created ? "bg-up-soft text-up" : "bg-surface-2 text-muted",
        )}
      >
        <Lock className="size-3.5" />
        {created ? (
          <span>Entry locked at {formatDate(t.firstPastedAt)}. You&apos;re the first to paste this one.</span>
        ) : (
          <span>
            Already on Rankr, first pasted <TimeAgo at={t.firstPastedAt} />.
            {result.firstCallByYou ? " Saved to your calls from today's price." : ""}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto grid size-6 place-items-center rounded-md hover:bg-surface-2"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <Link href={tokenHref(t)} className="flex items-center gap-3 p-4 transition hover:bg-surface-2/60">
        <TokenAvatar symbol={t.symbol} imageUrl={t.imageUrl} chainId={t.chainId} seed={t.id} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold">${t.symbol}</span>
            <ChainBadge chainId={t.chainId} />
          </div>
          <div className="tabular mt-0.5 truncate text-sm text-muted">
            Entry {formatUsd(t.entryMarketCap)} <span className="text-subtle">→</span> now {formatUsd(t.marketCap)}
          </div>
        </div>
        <MultipleBadge multiple={t.multiple} />
        <ArrowRight className="hidden size-4 text-subtle sm:block" />
      </Link>
    </div>
  );
}
