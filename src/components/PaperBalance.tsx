"use client";

import clsx from "clsx";
import { Plus, Wallet } from "lucide-react";
import { useId, useState } from "react";
import { parseAmount, useMoney } from "@/lib/currency";
import { addPaperFunds, usePaperWallet } from "@/lib/paper";

/** Round starting balances, in each currency (shortcuts: any amount can be typed). */
const USD_STARTS = [100, 1_000, 10_000];
const IDR_STARTS = [1_000_000, 10_000_000, 100_000_000];

/**
 * The paper wallet's cash, with a way to add to it. Before there is one: picking the balance to start with,
 * any amount.
 */
export function PaperBalance({ className }: { className?: string }) {
  const wallet = usePaperWallet();
  const money = useMoney();
  const [open, setOpen] = useState(false);

  if (!wallet) {
    return (
      <div className={clsx("card p-4", className)}>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="size-4 text-muted" /> Start with a balance
        </p>
        <p className="mt-1 text-xs text-muted">Any amount: buys take from it, sales pay into it.</p>
        <FundsForm cta="Start" onDone={() => {}} className="mt-3" />
      </div>
    );
  }

  return (
    <div className={clsx("text-xs", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-muted">
          <Wallet className="size-3.5" /> Balance{" "}
          <span className="tabular font-mono text-fg">{money.format(wallet.cashUsd)}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-muted hover:text-fg"
        >
          <Plus className="size-3" /> Add funds
        </button>
      </div>
      {open && <FundsForm cta="Add" onDone={() => setOpen(false)} className="mt-2" />}
    </div>
  );
}

function FundsForm({ cta, onDone, className }: { cta: string; onDone: () => void; className?: string }) {
  const money = useMoney();
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const idr = money.shown === "idr" && money.rate;
  const starts = idr ? IDR_STARTS.map((n) => n / money.rate!.usdIdr) : USD_STARTS;
  const usd = typed ? parseAmount(typed, money.shown, money.rate?.usdIdr ?? null) : null;

  function add(amount: number | null) {
    if (!amount) return;
    addPaperFunds(amount);
    setTyped("");
    onDone();
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-1">
        {starts.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            className="h-8 rounded-md border border-border font-mono text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {idr ? money.format(s, { short: true }) : `$${s.toLocaleString("en-US")}`}
          </button>
        ))}
      </div>
      <form
        className="mt-1.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add(usd);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Amount
        </label>
        <input
          id={inputId}
          inputMode="decimal"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={idr ? "Other amount, e.g. 2,5 jt" : "Other amount, e.g. 2,500"}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2.5 font-mono text-xs outline-none placeholder:text-subtle focus:border-border-strong"
        />
        <button
          type="submit"
          disabled={!usd}
          className="h-8 shrink-0 rounded-md bg-fg px-3 text-xs font-medium text-bg hover:opacity-85 disabled:opacity-40"
        >
          {cta}
        </button>
      </form>
    </div>
  );
}
