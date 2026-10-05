"use client";

import clsx from "clsx";
import { ArrowDownUp, Check, ClipboardPaste, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import useSWR from "swr";
import { parseAmount, spendPresets, useMoney } from "@/lib/currency";
import { formatAmount, formatMultiple, formatPrice, formatUsd, tokenHref } from "@/lib/format";
import { fetcher } from "@/lib/hooks";
import { MAX_TRADES, PAPER_NOTE, holdingsOf, swapBuy, swapSell, usePaperTrades, usePaperWallet, type SwapError } from "@/lib/paper";
import { CONFIRM_IMPACT, WARN_IMPACT, atMultiple, poolOf, quoteBuy, quoteSell } from "@/lib/sim";
import { lookupPaste } from "@/lib/track";
import type { MarketSnapshot, TokenResponse } from "@/lib/types";
import { tokenId } from "@/lib/address";
import { ChainTag } from "./Chain";
import { PaperBalance } from "./PaperBalance";
import { RateNote } from "./RateNote";
import { TokenName } from "./TokenList";

type Side = "buy" | "sell";

/** Price moves to show a buy's exit at, "if the liquidity holds". */
const EXITS = [
  { k: 2, label: "2x" },
  { k: 5, label: "5x" },
  { k: 10, label: "10x" },
  { k: 0.5, label: "-50%" },
];

/** Slippage you accept between the quote and the swap; memecoins move fast, so 3% by default. */
const SLIPPAGES = [0.01, 0.03, 0.05, 0.1];

const pct = (x: number) => `${(x * 100).toFixed(x >= 0.1 ? 0 : 1)}%`;
const impactLabel = (x: number) => (x >= 1 ? `${formatMultiple(1 + x)} the market price` : pct(x));

const ERRORS: Record<SwapError, string> = {
  balance: "Not enough paper balance for that.",
  holdings: "You don't hold that much of it.",
  price: "This token has no live price right now.",
  stale: "No fresh price right now: try again in a moment.",
  drained: "This pool is drained: there's nothing to trade against.",
  full: `You have ${MAX_TRADES} open paper trades: sell or clear some first.`,
};

/** A typed token amount: "1,250,000" or "1250000.5". */
function parseTokens(input: string): number | null {
  return parseAmount(input, "usd", null);
}

/**
 * A paper swap, the way a wallet does it: paste a token, pick how much, swap. Buys pay from the paper balance,
 * sales pay into it; nothing real is traded. The quote is fetched again at the moment of the swap, and the
 * swap fails, as a real one would, if the price moved past the slippage you accept.
 */
export function Swap() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chain = params.get("chain");
  const ca = params.get("ca");
  const key = chain && ca ? `/api/tokens/${encodeURIComponent(chain)}/${encodeURIComponent(ca)}` : null;
  const { data, error, isLoading, mutate } = useSWR<TokenResponse>(key, fetcher, { refreshInterval: 15_000, keepPreviousData: false });
  const market: MarketSnapshot | null = data?.token?.market ?? data?.preview ?? null;

  const money = useMoney();
  const wallet = usePaperWallet();
  const trades = usePaperTrades();
  const held = market ? holdingsOf(trades, tokenId(market.chainId, market.address)) : null;

  const [side, setSide] = useState<Side>(params.get("side") === "sell" ? "sell" : "buy");
  const [typed, setTyped] = useState("");
  const [slippage, setSlippage] = useState(0.03);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<{ paid: string; got: string } | null>(null);
  const amountId = useId();

  // An amount typed in one currency means nothing in the other: switching clears it.
  const [typedIn, setTypedIn] = useState(money.shown);
  if (typedIn !== money.shown) {
    setTypedIn(money.shown);
    if (side === "buy") setTyped("");
    setConfirming(false);
  }

  // A link with an amount (?usd=) starts with it, once the currency it's shown in is known.
  const preset = Number(params.get("usd"));
  const presetDone = useRef(false);
  useEffect(() => {
    if (presetDone.current || !(preset > 0) || (money.currency === "idr" && !money.rate)) return;
    presetDone.current = true;
    setTyped(money.rate && money.currency === "idr" ? String(Math.round(preset * money.rate.usdIdr)) : String(preset));
  }, [preset, money.currency, money.rate]);

  function reset() {
    setTyped("");
    setConfirming(false);
    setFailure(null);
  }

  // What's typed: dollars (or rupiah) to pay when buying, tokens when selling.
  const spendUsd = side === "buy" && typed ? parseAmount(typed, money.shown, money.rate?.usdIdr ?? null) : null;
  const sellTokens = side === "sell" && typed ? parseTokens(typed) : null;
  const buy = market && spendUsd ? quoteBuy(market, spendUsd) : null;
  const sell = market && sellTokens ? quoteSell(market, sellTokens) : null;
  const impact = side === "buy" ? (buy?.impact ?? 0) : (sell?.impact ?? 0);
  const receive = side === "buy" ? (buy?.tokens ?? null) : (sell?.proceedsUsd ?? null);
  const minReceive = receive === null ? null : receive * (1 - slippage);
  const quality = side === "buy" ? buy?.quality : sell?.quality;

  const short =
    side === "buy"
      ? !!wallet && !!spendUsd && spendUsd > wallet.cashUsd * (1 + 1e-9)
      : !!sellTokens && sellTokens > (held?.tokens ?? 0) * (1 + 1e-9);
  const tooSmall = side === "buy" && !!spendUsd && !!market && market.priceUsd > 0 && !buy;
  const canSwap = !!market && receive !== null && receive > 0 && !short && (side === "sell" || !!wallet);

  async function swap(e: React.MouseEvent) {
    // The second click of a double-click isn't a "yes" to the large-impact warning the first one raised.
    if (e.detail > 1) return;
    if (!market || !key || receive === null || minReceive === null) return;
    if (impact >= CONFIRM_IMPACT && !confirming) return setConfirming(true);
    setBusy(true);
    setFailure(null);
    try {
      // The price now, not the one on screen: a swap fills at the moment it's sent.
      const fresh = await fetcher<TokenResponse>(key);
      const m = fresh.token?.market ?? fresh.preview;
      void mutate(fresh, { revalidate: false });
      if (!m) throw new Error(ERRORS.price);
      const now = side === "buy" ? (quoteBuy(m, spendUsd!)?.tokens ?? 0) : (quoteSell(m, sellTokens!)?.proceedsUsd ?? 0);
      if (now < minReceive) {
        const got = side === "buy" ? `${formatAmount(now)} $${m.symbol}` : money.format(now);
        throw new Error(`The price moved past your ${pct(slippage)} slippage: you'd get ${got} now. Check the new quote and swap again.`);
      }
      if (side === "buy") {
        const out = swapBuy(m, spendUsd!, money.rate?.usdIdr ?? null);
        if (typeof out === "string") throw new Error(ERRORS[out]);
        setDone({ paid: money.format(out.spentUsd), got: `${formatAmount(out.tokens)} $${m.symbol}` });
      } else {
        const out = swapSell(tokenId(m.chainId, m.address), sellTokens!, m);
        if (typeof out === "string") throw new Error(ERRORS[out]);
        setDone({ paid: `${formatAmount(out.tokens)} $${m.symbol}`, got: money.format(out.proceedsUsd) });
      }
      reset();
    } catch (err) {
      setFailure((err as Error).message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const label = !market
    ? "Paste a token"
    : side === "buy" && !wallet
      ? "Pick a paper balance first"
      : !typed
        ? "Enter an amount"
        : tooSmall
          ? "Too small to cover network costs"
          : short
            ? side === "buy"
              ? "Not enough paper balance"
              : `Not enough $${market.symbol}`
            : confirming
              ? `Swap anyway, at ${impactLabel(impact)} impact`
              : "Swap";

  return (
    <div className="mx-auto max-w-md pt-8 sm:pt-12">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Swap</h1>
        <span className="rounded border border-border px-1.5 font-mono text-[10px] tracking-wide text-subtle uppercase">paper</span>
      </div>

      <TokenPicker
        market={market}
        loading={isLoading}
        error={key && error ? "Couldn't load this token. Try again." : null}
        onPick={(m) => {
          reset();
          setDone(null);
          router.replace(`${pathname}?chain=${encodeURIComponent(m.chainId)}&ca=${encodeURIComponent(m.address)}`, { scroll: false });
        }}
        onClear={() => {
          reset();
          setDone(null);
          router.replace(pathname, { scroll: false });
        }}
      />

      {done ? (
        <div role="status" className="mt-4 card p-5 text-center">
          <Check className="mx-auto size-6 text-up" />
          <p className="mt-2 font-medium">
            Swapped {done.paid} for ≈ {done.got}
          </p>
          <p className="mt-1 text-xs text-muted">On paper: no real money moved.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/me?tab=paper" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              Your paper trades
            </Link>
            <button type="button" onClick={() => setDone(null)} className="inline-flex h-9 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-85">
              Swap again
            </button>
          </div>
        </div>
      ) : (
        <>
          {!wallet && side === "buy" && <PaperBalance className="mt-4" />}

          <div className="mt-4 space-y-1">
            {/* You pay */}
            <div className="card p-4">
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <label htmlFor={amountId}>You pay</label>
                {side === "buy" && wallet && (
                  <span className="flex items-center gap-2">
                    <span className="tabular font-mono">{money.format(wallet.cashUsd)}</span>
                    <MaxButtons
                      onPick={(f) => {
                        const usd = wallet.cashUsd * f;
                        setTyped(money.shown === "idr" && money.rate ? String(Math.floor(usd * money.rate.usdIdr)) : (Math.floor(usd * 100) / 100).toString());
                        setConfirming(false);
                      }}
                    />
                  </span>
                )}
                {side === "sell" && market && (
                  <span className="flex items-center gap-2">
                    <span className="tabular font-mono">{formatAmount(held?.tokens ?? 0)}</span>
                    {!!held?.tokens && (
                      <MaxButtons
                        onPick={(f) => {
                          setTyped(String(f >= 1 ? held.tokens : held.tokens * f));
                          setConfirming(false);
                        }}
                      />
                    )}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id={amountId}
                  inputMode="decimal"
                  value={typed}
                  onChange={(e) => {
                    setTyped(e.target.value);
                    setConfirming(false);
                    setFailure(null);
                  }}
                  placeholder="0"
                  className="tabular min-w-0 flex-1 bg-transparent font-mono text-3xl font-medium tracking-tight outline-none placeholder:text-subtle"
                />
                <span className="shrink-0 rounded-md border border-border px-2 py-1 font-mono text-xs">
                  {side === "buy" ? money.shown.toUpperCase() : market ? `$${market.symbol}` : "token"}
                </span>
              </div>
              {side === "buy" && (
                <div className="mt-3 grid grid-cols-4 gap-1">
                  {spendPresets(money.shown, money.rate?.usdIdr ?? null).map((p) => (
                    <button
                      key={p.usd}
                      type="button"
                      onClick={() => {
                        setTyped(money.shown === "idr" && money.rate ? String(Math.round(p.usd * money.rate.usdIdr)) : String(p.usd));
                        setConfirming(false);
                      }}
                      className="h-7 truncate rounded-md border border-border px-1 font-mono text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Flip: on the seam between the two, as a wallet has it. */}
            <div className="relative z-10 h-1">
              <button
                type="button"
                onClick={() => {
                  setSide((s) => (s === "buy" ? "sell" : "buy"));
                  reset();
                }}
                aria-label={side === "buy" ? "Switch to selling" : "Switch to buying"}
                title={side === "buy" ? "Sell instead" : "Buy instead"}
                className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-bg text-muted shadow-sm transition-colors hover:text-fg"
              >
                <ArrowDownUp className="size-4" />
              </button>
            </div>

            {/* You receive */}
            <div className="card p-4">
              <div className="text-xs text-muted">You receive (estimate)</div>
              <div className="mt-2 flex items-center gap-3">
                <span className={clsx("tabular min-w-0 flex-1 truncate font-mono text-3xl font-medium tracking-tight", receive === null && "text-subtle")}>
                  {receive === null ? "0" : side === "buy" ? `≈ ${formatAmount(receive)}` : `≈ ${money.format(receive)}`}
                </span>
                <span className="shrink-0 rounded-md border border-border px-2 py-1 font-mono text-xs">
                  {side === "buy" ? (market ? `$${market.symbol}` : "token") : money.shown.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {market && receive !== null && minReceive !== null && (
            <dl className="mt-3 space-y-1.5 px-1 font-mono text-xs">
              <Row label="Rate">
                1 ${market.symbol} ≈ {formatPrice(side === "buy" ? buy!.fillPriceUsd : sell!.proceedsUsd / sellTokens!)}
              </Row>
              <Row label="Price impact">
                <span className={impact >= WARN_IMPACT ? "text-down" : impact >= 0.01 ? "text-fg" : "text-muted"}>
                  {quality === "none" ? "unknown" : impactLabel(impact)}
                </span>
              </Row>
              <Row label="Fees">
                ≈ {money.format(side === "buy" ? buy!.feeUsd + buy!.networkUsd : sell!.feeUsd + sell!.networkUsd)}{" "}
                <span className="text-muted">· {(poolOf(market).fee * 100).toFixed(2).replace(/\.?0+$/, "")}% + network</span>
              </Row>
              <Row label={`Minimum received (${pct(slippage)})`}>
                {side === "buy" ? `${formatAmount(minReceive)} $${market.symbol}` : money.format(minReceive)}
              </Row>
              <Row label="Slippage">
                <span className="inline-flex gap-1">
                  {SLIPPAGES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={slippage === s}
                      onClick={() => setSlippage(s)}
                      className={clsx(
                        "rounded px-1.5 py-0.5 transition-colors",
                        slippage === s ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      {pct(s)}
                    </button>
                  ))}
                </span>
              </Row>
              <Row label="Route">
                <span className="text-muted">
                  {market.dexId}
                  {market.quoteSymbol ? ` · ${market.quoteSymbol} pool` : ""}
                  {quality && quality !== "good" ? ` · ${quality === "none" ? "no depth" : "rough"}` : ""}
                </span>
              </Row>
            </dl>
          )}

          {side === "buy" && market && buy && spendUsd && (
            <div className="mt-3 px-1">
              <div className="label mb-1.5 text-subtle">If sold at</div>
              <div className="grid grid-cols-4 gap-1 text-center font-mono text-[11px]">
                {EXITS.map((e) => {
                  const out = quoteSell(atMultiple(market, e.k), buy.tokens);
                  return (
                    <div key={e.label} className="rounded-md bg-surface-2 px-1 py-1.5">
                      <div className="text-subtle">{e.label}</div>
                      <div className={clsx("tabular mt-0.5 truncate", out && out.proceedsUsd > spendUsd ? "text-up" : "text-down")}>
                        {out ? money.format(out.proceedsUsd, { short: true }) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-subtle">After fees and price impact, if the pool&apos;s liquidity holds.</p>
            </div>
          )}

          {impact >= WARN_IMPACT && receive !== null && (
            <p className="mt-3 rounded-md border border-down/40 px-2.5 py-2 text-xs text-down">
              Large price impact ({impactLabel(impact)}): this pool is thin for a swap this size. A smaller amount fills closer to the market price.
            </p>
          )}
          {failure && (
            <p role="alert" className="mt-3 rounded-md border border-down/40 px-2.5 py-2 text-xs text-down">
              {failure}
            </p>
          )}

          <button
            type="button"
            onClick={swap}
            disabled={!canSwap || busy || tooSmall}
            className={clsx(
              "mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg text-base font-medium hover:opacity-90 disabled:opacity-40",
              confirming ? "border border-down text-down" : "bg-fg text-bg",
            )}
          >
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            {busy ? "Swapping…" : label}
          </button>

          {wallet && <PaperBalance className="mt-4" />}
          <RateNote className="mt-3" />
          <p className="mt-2 text-[11px] leading-relaxed text-subtle">{PAPER_NOTE}</p>
        </>
      )}
    </div>
  );
}

function MaxButtons({ onPick }: { onPick: (fraction: number) => void }) {
  return (
    <span className="flex gap-1">
      {[
        [0.5, "Half"],
        [1, "Max"],
      ].map(([f, l]) => (
        <button
          key={l}
          type="button"
          onClick={() => onPick(f as number)}
          className="rounded border border-border px-1.5 font-mono text-[10px] text-muted uppercase hover:bg-surface-2 hover:text-fg"
        >
          {l}
        </button>
      ))}
    </span>
  );
}

/** Paste a CA (or a link) to pick the token; once picked, the token with a way to change it. */
function TokenPicker({
  market,
  loading,
  error,
  onPick,
  onClear,
}: {
  market: MarketSnapshot | null;
  loading: boolean;
  error: string | null;
  onPick: (m: MarketSnapshot) => void;
  onClear: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inputId = useId();

  async function look(input: string) {
    if (!input.trim()) return;
    setBusy(true);
    setFailure(null);
    try {
      const { preview } = await lookupPaste(input.trim());
      setValue("");
      onPick(preview);
    } catch (err) {
      setFailure((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      setValue(text);
      await look(text);
    } catch {
      setFailure("Couldn't read the clipboard. Paste the address into the box.");
    }
  }

  if (market) {
    return (
      <div className="mt-4 flex items-center gap-3 card px-4 py-3">
        <Link href={tokenHref(market)} className="min-w-0 flex-1">
          <TokenName symbol={market.symbol} name={market.name} />
          <div className="tabular mt-0.5 truncate font-mono text-[11px] text-subtle">
            <ChainTag chainId={market.chainId} /> · {formatPrice(market.priceUsd)} · mc {formatUsd(market.marketCap ?? market.fdv)} · liq{" "}
            {formatUsd(market.liquidityUsd)}
          </div>
        </Link>
        <button type="button" onClick={onClear} aria-label="Pick another token" title="Pick another token" className="shrink-0 rounded p-1 text-subtle hover:text-fg">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void look(value);
        }}
        className="flex items-center gap-2 card p-1.5 pl-3"
      >
        <label htmlFor={inputId} className="sr-only">
          Token contract address or link
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a contract address or link"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
        />
        {value ? (
          <button type="submit" disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-sm font-medium text-bg hover:opacity-85 disabled:opacity-60">
            {busy && <LoaderCircle className="size-3.5 animate-spin" />}
            Find
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void paste()}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <ClipboardPaste className="size-3.5" />}
            Paste
          </button>
        )}
      </form>
      {(failure || error) && <p className="mt-2 text-xs text-down">{failure ?? error}</p>}
      {loading && <p className="mt-2 text-xs text-muted">Loading the token…</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 font-sans text-muted">{label}</dt>
      <dd className="tabular min-w-0 text-right">{children}</dd>
    </div>
  );
}
