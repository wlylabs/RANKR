"use client";

import clsx from "clsx";
import { ArrowRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { parseWallet, traceHref } from "@/lib/trace/chains";

/** The wallet box: paste an address or an explorer link, and the tree opens on it. */
export function TraceInput({ autoFocus, size = "md" }: { autoFocus?: boolean; size?: "md" | "lg" }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lg = size === "lg";

  const go = (raw: string) => {
    const wallet = parseWallet(raw);
    if (!wallet) {
      setError("That isn't a Solana or EVM wallet address.");
      return;
    }
    setError(null);
    router.push(traceHref(wallet.chain, wallet.address));
  };

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) go(value);
          else inputRef.current?.focus();
        }}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors focus-within:border-border-strong"
      >
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onPaste={(e) => {
            // A pasted wallet opens right away, no extra click.
            const text = e.clipboardData.getData("text").trim();
            if (parseWallet(text)) {
              e.preventDefault();
              setValue(text);
              go(text);
            }
          }}
          placeholder="Paste a wallet address or explorer link"
          aria-label="Wallet address"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className={clsx(
            "min-w-0 flex-1 bg-transparent px-2.5 font-mono tracking-tight outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-subtle",
            lg ? "h-10 text-[15px]" : "h-9 text-sm",
          )}
        />
        {value && (
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
        <button
          type="submit"
          className={clsx(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-fg font-medium text-bg transition-opacity hover:opacity-85",
            lg ? "h-10 px-4 text-sm" : "h-9 px-3.5 text-sm",
          )}
        >
          Trace
          <ArrowRight className="size-3.5" />
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 px-1 text-sm text-down">
          {error}
        </p>
      )}
    </div>
  );
}
