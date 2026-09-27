"use client";

import clsx from "clsx";
import { Check, Copy, Download, KeyRound, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { keyArt, parseKey } from "@/lib/key";
import { useAuth } from "./AuthProvider";

const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-fg px-4 text-sm font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50";
const SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-50";

/** The key's dot pattern (see keyArt), so the key you saved and the key you paste can be matched at a glance. */
export function KeyArt({ value, size = 40, className }: { value: string | null; size?: number; className?: string }) {
  const [cells, setCells] = useState<[number, number][] | null>(null);
  useEffect(() => {
    let live = true;
    if (value) void keyArt(value).then((c) => live && setCells(c));
    else setCells(null);
    return () => {
      live = false;
    };
  }, [value]);
  const cell = 64 / 5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={clsx("shrink-0 rounded-md border border-border bg-surface-2", className)}
      aria-hidden="true"
    >
      {(cells ?? []).map(([c, r]) => (
        <circle key={`${c}${r}`} cx={c * cell + cell / 2} cy={r * cell + cell / 2} r={cell * 0.28} fill="currentColor" />
      ))}
    </svg>
  );
}

/** A freshly made key, shown once: copy it or download it, then confirm. */
export function KeyReveal({ value, username, onDone }: { value: string; username: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  function download() {
    const text = [
      `Rankr sign-in key for @${username}`,
      "",
      value,
      "",
      `Sign in at ${window.location.origin}/login and paste this key.`,
      "Anyone with this key can sign in as you. Rankr can't show it again or recover it.",
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `rankr-key-${username}.txt` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="animate-fade-in mt-5">
      <div className="flex items-center gap-3 rounded-lg border border-border-strong bg-bg p-3">
        <KeyArt value={value} size={44} />
        <code className="min-w-0 flex-1 font-mono text-sm break-words select-all sm:text-base">{value}</code>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: the key is selectable */
            }
          }}
          className={clsx(SECONDARY, "h-9 flex-1")}
        >
          {copied ? <Check className="size-4 text-up" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={download} className={clsx(SECONDARY, "h-9 flex-1")}>
          <Download className="size-4" />
          Download
        </button>
      </div>
      <p className="mt-3 text-sm text-muted">
        Keep it somewhere safe, like a password manager. Rankr can&apos;t show it again, and anyone who has it can sign
        in as <span className="font-mono text-fg">@{username}</span>.
      </p>
      <button type="button" onClick={onDone} className={clsx(PRIMARY, "mt-4 w-full")}>
        I saved my key
      </button>
    </div>
  );
}

/** Paste a key to sign in. The dot pattern shows once the key is complete. */
export function KeySignInForm({
  submitLabel = "Sign in with key",
  primary = false,
  autoFocus,
}: {
  submitLabel?: string;
  primary?: boolean;
  autoFocus?: boolean;
}) {
  const { signInWithKey } = useAuth();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = parseKey(value);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithKey(value);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="key" className="label text-subtle">
        Your key
      </label>
      <div className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-border bg-surface pr-1.5 pl-3 transition-colors focus-within:border-border-strong">
        <input
          id="key"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="rk-XXXX-XXXX-XXXX-XXXX-XXXX"
          className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase outline-none placeholder:normal-case placeholder:text-subtle/60"
        />
        {key && <KeyArt value={key} size={32} className="animate-fade-in" />}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-down">
          {error}
        </p>
      )}
      <button type="submit" disabled={!value.trim() || busy} className={clsx(primary ? PRIMARY : SECONDARY, "mt-3 w-full")}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {submitLabel}
      </button>
    </form>
  );
}
