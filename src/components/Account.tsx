"use client";

import { LoaderCircle, LogOut, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loginHref } from "@/lib/login";
import { useAuth } from "./AuthProvider";
import { UsernameForm } from "./UsernameForm";

const INPUT =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 outline-none transition-colors placeholder:text-subtle/60 focus:border-border-strong";
const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-fg px-4 text-sm font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50";

/** Change the name, keep a guest account by adding an email, sign out. */
export function Account() {
  const router = useRouter();
  const { available, ready, userId, email, username, guest, signOut } = useAuth();
  const [saved, setSaved] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  useEffect(() => {
    if (!available || (ready && (!userId || !username))) router.replace(available ? loginHref("/account") : "/");
  }, [available, ready, userId, username, router]);

  if (!ready || !userId || !username) {
    return (
      <div className="pt-14">
        <LoaderCircle className="size-5 animate-spin text-subtle" />
      </div>
    );
  }

  async function out() {
    await signOut();
    router.replace("/");
  }

  return (
    <div className="mx-auto max-w-lg pt-10 sm:pt-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Account</h1>
      <p className="mt-1.5 text-sm text-muted">
        You are <span className="font-mono text-fg">@{username}</span> on the caller board
        {guest ? ", as a guest." : "."}
      </p>

      {guest && <KeepAccount />}

      <section className="mt-6 rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Change username</h2>
        <p className="mt-1 mb-5 text-sm text-muted">Your calls move with you. The old name becomes free for others.</p>
        <UsernameForm key={username} initial={username} current={username} submitLabel="Save username" onSaved={() => setSaved(true)} />
        {saved && <p className="mt-3 text-xs text-up">Saved.</p>}
      </section>

      {!guest && (
        <section className="mt-6 rounded-lg border border-border p-5">
          <h2 className="text-sm font-medium">Email</h2>
          <p className="mt-1 font-mono text-sm break-all text-muted">{email}</p>
          <p className="mt-2 text-xs text-subtle">Private. Only used to send your sign-in links.</p>
        </section>
      )}

      {guest && confirmOut ? (
        <div className="mt-6 rounded-lg border border-down/40 p-4">
          <p className="text-sm">
            Guest accounts can&apos;t sign back in. After signing out, <span className="font-mono">@{username}</span> and its
            calls stay on the board but you lose access. Add an email first to keep it.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={out}
              className="h-8 rounded-md border border-border px-3 text-sm text-down transition-colors hover:bg-surface-2"
            >
              Sign out anyway
            </button>
            <button
              type="button"
              onClick={() => setConfirmOut(false)}
              className="h-8 rounded-md px-3 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (guest ? setConfirmOut(true) : void out())}
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      )}
    </div>
  );
}

/** Guest -> email account. Same user, so the name and calls stay. */
function KeepAccount() {
  const { addEmail, verifyEmailCode } = useAuth();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-border-strong bg-surface p-5">
      <h2 className="text-sm font-medium">Keep this account</h2>
      <p className="mt-1 text-sm text-muted">
        A guest account lives in this browser only. Clear your browser data or switch devices and it&apos;s gone. Add an
        email to sign in anywhere; your name and calls stay the same.
      </p>
      {!sentTo ? (
        <form
          className="mt-5 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const to = email.trim();
            if (to) void run(async () => {
              await addEmail(to);
              setSentTo(to);
            });
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email"
            className={INPUT}
          />
          <button type="submit" disabled={!email.trim() || busy} className={`${PRIMARY} h-11 shrink-0`}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Add email
          </button>
        </form>
      ) : (
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length >= 6) void run(() => verifyEmailCode(sentTo, code));
          }}
        >
          <p className="text-sm text-muted">
            We sent a link to <span className="text-fg">{sentTo}</span>. Open it on this device, or enter the code:
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 10));
                setError(null);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              aria-label="Code from the email"
              className={`${INPUT} text-center font-mono tracking-[0.4em]`}
            />
            <button type="submit" disabled={code.length < 6 || busy} className={`${PRIMARY} h-11 shrink-0`}>
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Confirm
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setCode("");
              setError(null);
            }}
            className="mt-3 text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Use a different email
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-down">
          {error}
        </p>
      )}
    </section>
  );
}
