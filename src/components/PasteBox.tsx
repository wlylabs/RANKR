"use client";

import clsx from "clsx";
import { ClipboardPaste, KeyRound, LoaderCircle, Lock, Star, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseInput } from "@/lib/address";
import { formatDate, formatUsd, tokenHref } from "@/lib/format";
import { loginHref, loginToPaste } from "@/lib/login";
import { ratio } from "@/lib/metrics";
import { PasteError, lookupPaste, rememberPendingPaste, takePendingPaste, trackPaste } from "@/lib/track";
import type { LookupResponse, TrackResponse } from "@/lib/types";
import { useWatchlist, watch, watchedFrom, type Watched } from "@/lib/watchlist";
import { useAuth } from "./AuthProvider";
import { MultipleBadge } from "./MultipleBadge";
import { ShareCall } from "./ShareCall";
import { TimeAgo } from "./TimeAgo";
import { ChainTag } from "./Chain";
import { TokenName } from "./TokenList";

type Result = TrackResponse & { firstCallByYou: boolean };
/** A looked-up paste waiting on a choice: post it as a call, or save it to the watchlist. */
type Choice = LookupResponse & { input: string };

/**
 * The CA input. A paste is looked up first, then either posted as a call (sealed, public, needs a signed-in
 * account with a username) or saved to the watchlist (private, on this device, not a call). A signed-out
 * call goes through /login and comes back as `/app?ca=...`, which the box with `resumeFromUrl` posts.
 */
export function PasteBox({
  autoFocus,
  size = "lg",
  resumeFromUrl,
}: {
  autoFocus?: boolean;
  size?: "md" | "lg";
  resumeFromUrl?: boolean;
}) {
  const router = useRouter();
  const { available, ready, userId, username, hasKey, continueAsGuest } = useAuth();
  const [joining, setJoining] = useState(false);
  const needsAccount = available && ready && (!userId || !username);
  const resumed = useRef(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState<"lookup" | "call" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<Watched | null>(null);
  const [canReadClipboard, setCanReadClipboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanReadClipboard(typeof navigator !== "undefined" && !!navigator.clipboard?.readText);
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Back from signing in with a call to post. Only a call chosen here is sent; any other ?ca= just fills the box.
  useEffect(() => {
    if (!resumeFromUrl || resumed.current || !ready || needsAccount) return;
    const url = new URL(window.location.href);
    const ca = url.searchParams.get("ca");
    if (!ca) return;
    resumed.current = true;
    url.searchParams.delete("ca");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    setValue(ca);
    if (takePendingPaste(ca)) void post(ca);
    else inputRef.current?.focus();
  }, [resumeFromUrl, ready, needsAccount]);

  function signInToPaste(input: string) {
    rememberPendingPaste(input);
    router.push(loginToPaste(input));
  }

  function clearOutcome() {
    setError(null);
    setChoice(null);
    setResult(null);
    setSaved(null);
  }

  /** Looks the paste up, then offers the choice. */
  async function find(raw: string) {
    const input = raw.trim();
    if (!input || loading) return;
    clearOutcome();
    if (!parseInput(input)) {
      setError("That doesn't look like a contract address. Paste a CA or a pump.fun / DexScreener link.");
      return;
    }
    setLoading("lookup");
    try {
      setChoice({ ...(await lookupPaste(input)), input });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  /** Posts the paste as your call: the entry is sealed. `chain` pins the chain the lookup found. */
  async function post(input: string, chain?: string) {
    if (loading) return;
    if (needsAccount) return signInToPaste(input);
    clearOutcome();
    setLoading("call");
    try {
      setResult(await trackPaste(input, chain));
      setValue("");
    } catch (err) {
      if (err instanceof PasteError && err.code) return signInToPaste(input);
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  function save(c: Choice) {
    const entry = watchedFrom(c.token ?? c.preview);
    watch(entry);
    clearOutcome();
    setSaved(entry);
    setValue("");
  }

  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setValue(text);
      void find(text);
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
          void find(value);
        }}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors focus-within:border-border-strong"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
            if (choice) setChoice(null);
          }}
          onPaste={(e) => {
            // Pasting a valid CA looks it up right away, no extra click.
            const text = e.clipboardData.getData("text").trim();
            if (parseInput(text)) {
              e.preventDefault();
              setValue(text);
              void find(text);
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
              clearOutcome();
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
          disabled={!!loading}
          className={clsx(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-fg font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-60",
            lg ? "h-10 px-4 text-sm" : "h-9 px-3.5 text-sm",
          )}
        >
          {loading ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              <span className="hidden sm:inline">{loading === "call" ? "Sealing" : "Checking"}</span>
            </>
          ) : pasteMode ? (
            <>
              <ClipboardPaste className="size-4 sm:hidden" />
              <span className="sm:hidden">Paste</span>
              <span className="hidden sm:inline">Check</span>
            </>
          ) : (
            "Check"
          )}
        </button>
      </form>

      {needsAccount && !error && !choice && (
        <p className={clsx("mt-2.5 flex items-center gap-1.5 text-xs text-subtle", lg && "justify-center")}>
          <Lock className="size-3 shrink-0" />
          {userId ? (
            <span>
              <Link href={loginHref()} className="text-fg underline-offset-4 hover:underline">
                Pick a username
              </Link>{" "}
              to post calls.
            </span>
          ) : (
            <span>
              Posting a call needs an account.{" "}
              <button
                type="button"
                disabled={joining}
                onClick={async () => {
                  setJoining(true);
                  try {
                    await continueAsGuest();
                    inputRef.current?.focus();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setJoining(false);
                  }
                }}
                className="text-fg underline-offset-4 hover:underline disabled:opacity-60"
              >
                {joining ? "Creating…" : "Continue as guest"}
              </button>{" "}
              or{" "}
              <Link href={loginHref()} className="text-fg underline-offset-4 hover:underline">
                sign in with your key
              </Link>
              .
            </span>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="animate-fade-in mt-2.5 flex items-start gap-2 text-left text-sm text-down">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {choice && (
        <ChoiceCard
          choice={choice}
          as={available && userId && username ? username : null}
          busy={loading === "call"}
          onCall={() => void post(choice.input, choice.preview.chainId)}
          onWatch={() => save(choice)}
          onClose={() => setChoice(null)}
        />
      )}

      {saved && <WatchSaved entry={saved} onClose={() => setSaved(null)} />}

      {result && (
        <TrackResult
          result={result}
          as={available && username ? username : null}
          keepAs={available && userId && username && !hasKey ? username : null}
          onClose={() => setResult(null)}
        />
      )}
    </div>
  );
}

/** The looked-up token and the two ways to keep it: a call (public, sealed) or the watchlist (private). */
function ChoiceCard({
  choice: c,
  as,
  busy,
  onCall,
  onWatch,
  onClose,
}: {
  choice: Choice;
  as: string | null;
  busy: boolean;
  onCall: () => void;
  onWatch: () => void;
  onClose: () => void;
}) {
  const p = c.preview;
  const t = c.token;
  const onWatchlist = useWatchlist().some((w) => w.id === watchedFrom(t ?? p).id);
  return (
    <div role="group" aria-label={`$${p.symbol}: post a call or watch`} className="animate-fade-in mt-3 overflow-hidden rounded-lg border border-border-strong bg-surface text-left">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <TokenName symbol={p.symbol} name={p.name} />
          <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
            <ChainTag chainId={p.chainId} /> · mc {formatUsd(p.marketCap ?? p.fdv)} · liq {formatUsd(p.liquidityUsd)}
            {t && (
              <>
                {" "}
                · on Rankr since <TimeAgo at={t.firstPastedAt} compact />
              </>
            )}
          </div>
        </div>
        {t && <MultipleBadge multiple={t.multiple} />}
        <button
          type="button"
          onClick={onClose}
          className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded text-subtle hover:bg-surface-2 hover:text-fg"
          aria-label="Cancel"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={onCall}
          disabled={busy}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-fg px-3 text-sm font-medium whitespace-nowrap text-bg transition-opacity hover:opacity-85 disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Lock className="size-3.5 shrink-0" />}
          Post call
        </button>
        <button
          type="button"
          onClick={onWatch}
          disabled={onWatchlist}
          aria-label={onWatchlist ? "On your watchlist" : "Save to watchlist"}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium whitespace-nowrap transition-colors hover:bg-surface-2 disabled:text-muted disabled:hover:bg-transparent"
        >
          <Star className={clsx("size-3.5 shrink-0", onWatchlist && "fill-current")} />
          {/* Short on a phone, so both choices fit on one line. */}
          <span className="sm:hidden">{onWatchlist ? "Watching" : "Watchlist"}</span>
          <span className="hidden sm:inline">{onWatchlist ? "On your watchlist" : "Save to watchlist"}</span>
        </button>
        <p className="col-span-2 text-xs text-subtle">
          A call is public and sealed{as ? <> under <span className="font-mono text-muted">@{as}</span></> : null}, from the
          price right now. The watchlist is private, on this device, and not a call.
        </p>
      </div>
    </div>
  );
}

function WatchSaved({ entry, onClose }: { entry: Watched; onClose: () => void }) {
  return (
    <div role="status" className="animate-fade-in mt-3 flex items-center gap-2 card bg-surface px-4 py-2.5 text-left text-sm">
      <Star className="size-3.5 shrink-0 fill-current" />
      <span className="min-w-0 flex-1 truncate text-muted">
        <span className="font-medium text-fg">${entry.symbol}</span> saved to your watchlist at {formatUsd(entry.marketCap)} mc.
      </span>
      <Link href="/me?tab=watchlist" className="shrink-0 text-xs text-fg underline-offset-4 hover:underline">
        Open
      </Link>
      <button
        type="button"
        onClick={onClose}
        className="-mr-1 grid size-6 shrink-0 place-items-center rounded text-subtle hover:bg-surface-2 hover:text-fg"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * `as`: the account the call went under, so it can be shared right away. `keepAs`: a guest without a key,
 * nudged to save one now that the account holds a call.
 */
function TrackResult({
  result,
  as,
  keepAs,
  onClose,
}: {
  result: Result;
  as: string | null;
  keepAs: string | null;
  onClose: () => void;
}) {
  const t = result.token;
  const created = result.status === "created";
  // Your call, from your own entry (an earlier one of yours, if you had called it before).
  const yours = result.call && ratio(t.market?.priceUsd || t.entryPriceUsd, result.call.entryPriceUsd);
  return (
    <div role="status" className="animate-fade-in mt-3 overflow-hidden card bg-surface text-left">
      <Link href={tokenHref(t)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
        <div className="min-w-0 flex-1">
          <TokenName symbol={t.symbol} name={t.name} />
          <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
            <ChainTag chainId={t.chainId} /> · entry {formatUsd(t.entryMarketCap)}
            {/* A fresh paste is at its entry; "now" only says something later. */}
            {!created && <> · now {formatUsd(t.marketCap)}</>}
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
      {as && yours && (
        <ShareCall
          variant="row"
          className="border-t border-border"
          call={{
            username: as,
            token: t,
            // Market cap moves with the price: back from now to your entry.
            entryMarketCap: t.marketCap !== null ? t.marketCap / yours : null,
            multiple: yours,
          }}
        />
      )}
      {keepAs && (
        <Link
          href="/account"
          className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <KeyRound className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-mono">@{keepAs}</span> lives in this browser only. Save your key to keep it.
          </span>
        </Link>
      )}
    </div>
  );
}
