"use client";

import clsx from "clsx";
import { ArrowRight, ClipboardPaste, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseWallet, traceChain, traceHref } from "@/lib/trace/chains";
import type { LookupResponse } from "@/lib/types";

/** With a mouse, the box can take focus for free; on a phone, focusing it pops the keyboard up over the page. */
const withMouse = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/**
 * The token a paste points at, if it's one DexScreener knows: its own address (a DexScreener link carries the
 * pool's) and the chain it trades on (a bare 0x address could be on any). Null for a wallet, or when the lookup
 * can't be made: the paste then goes as it is.
 */
async function tokenOf(raw: string): Promise<{ chain: string; address: string } | null> {
  try {
    const res = await fetch(`/api/lookup?input=${encodeURIComponent(raw.trim())}`);
    if (!res.ok) return null;
    const { preview } = (await res.json()) as LookupResponse;
    return preview ? { chain: preview.chainId, address: preview.address } : null;
  } catch {
    return null;
  }
}

/**
 * The wallet box: paste a wallet or a token's CA (an address, or an explorer / DexScreener link), and its trail or
 * its report opens. Empty, Trace pastes what's on the clipboard and goes, like Paste on the CA box. `autoFocus` only
 * with a mouse: on a phone the keyboard stays down until the box is tapped.
 */
export function TraceInput({ autoFocus, size = "md" }: { autoFocus?: boolean; size?: "md" | "lg" }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [canReadClipboard, setCanReadClipboard] = useState(false);
  const [busy, setBusy] = useState(false);
  const lg = size === "lg";
  const pasteMode = !value && canReadClipboard;

  useEffect(() => {
    setCanReadClipboard(typeof navigator !== "undefined" && !!navigator.clipboard?.readText);
    if (autoFocus && withMouse()) inputRef.current?.focus();
  }, [autoFocus]);

  const go = async (raw: string) => {
    const wallet = parseWallet(raw);
    if (!wallet) {
      setError("That isn't a Solana or EVM wallet or token address.");
      return;
    }
    setError(null);
    setBusy(true);
    const token = await tokenOf(raw);
    setBusy(false);
    if (token && !traceChain(token.chain)) {
      setError(`That token trades on ${token.chain}, which Trace doesn't read yet.`);
      return;
    }
    const to = token ?? wallet;
    router.push(traceHref(to.chain, to.address));
  };

  async function pasteAndGo() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setError("The clipboard is empty. Copy a wallet address first.");
        if (withMouse()) inputRef.current?.focus();
        return;
      }
      setValue(text);
      await go(text);
    } catch {
      // The browser said no to reading the clipboard: paste by hand.
      setError("Couldn't read the clipboard. Tap the box and paste the address.");
      if (withMouse()) inputRef.current?.focus();
    }
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          if (value.trim()) void go(value);
          else if (canReadClipboard) void pasteAndGo();
          else inputRef.current?.focus();
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
            // A pasted wallet opens right away, no extra click.
            const text = e.clipboardData.getData("text").trim();
            if (parseWallet(text)) {
              e.preventDefault();
              setValue(text);
              void go(text);
            }
          }}
          placeholder="Paste a wallet or a token's CA"
          aria-label="Wallet or token address"
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
          disabled={busy}
          aria-busy={busy}
          title={pasteMode ? "Paste from the clipboard and trace" : undefined}
          className={clsx(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-fg font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-60",
            lg ? "h-10 px-4 text-sm" : "h-9 px-3.5 text-sm",
          )}
        >
          {pasteMode && <ClipboardPaste className="size-3.5" />}
          Trace
          {!pasteMode && <ArrowRight className="size-3.5" />}
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
