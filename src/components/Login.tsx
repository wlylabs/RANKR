"use client";

import { ArrowLeft, LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { safeNext } from "@/lib/login";
import { useAuth } from "./AuthProvider";
import { LogoMark } from "./Logo";
import { suggestUsername, UsernameForm } from "./UsernameForm";

const RESEND_AFTER_MS = 60_000;

const INPUT =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 outline-none transition-colors placeholder:text-subtle/60 focus:border-border-strong";
const PRIMARY =
  "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-fg text-sm font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50";
const LINK = "text-muted underline-offset-4 hover:text-fg hover:underline disabled:no-underline disabled:opacity-60";

function Shell({ title, children, intro }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm pt-14 pb-10 sm:pt-24">
      <LogoMark size={36} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
      {intro && <p className="mt-2 text-sm text-pretty text-muted">{intro}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

/** Sign in with an email link (or its code), then pick a username. Pasting needs both. */
export function Login() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const ca = new URL(next, "http://rankr").searchParams.get("ca");
  const { available, ready, userId, email: accountEmail, username, sendLink, verifyCode, signOut } = useAuth();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const now = useNow(1000);

  // A failed link (expired, already used) comes back with the error in the URL fragment.
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const failed = h.get("error_code") ?? h.get("error");
    if (!failed) return;
    setError(
      failed === "otp_expired"
        ? "That sign-in link has expired or was already used. Send a new one."
        : (h.get("error_description") ?? "Sign-in failed. Try again."),
    );
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const done = ready && !!userId && !!username;
  useEffect(() => {
    if (done) router.replace(next);
  }, [done, next, router]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const to = email.trim();
    if (!to || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendLink(to, next);
      setSentAt(Date.now());
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email.trim(), token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!available) {
    return (
      <Shell title="Accounts are off" intro="This deployment has no Supabase Auth configured, so pasting works without an account.">
        <Link href="/" className={PRIMARY}>
          Back to Rankr
        </Link>
      </Shell>
    );
  }

  if (!ready || done) {
    return (
      <Shell title={done ? "Signed in" : "Sign in"}>
        <LoaderCircle className="size-5 animate-spin text-subtle" />
      </Shell>
    );
  }

  if (userId) {
    return (
      <Shell title="Pick a username" intro="This is how you show up on the caller board. Your email is never shown.">
        <UsernameForm initial={suggestUsername(accountEmail)} submitLabel="Continue" />
        <p className="mt-6 text-xs text-subtle">
          Signed in as <span className="text-muted">{accountEmail}</span> ·{" "}
          <button type="button" onClick={() => void signOut()} className={LINK}>
            not you?
          </button>
        </p>
      </Shell>
    );
  }

  const pending = ca && (
    <div className="mb-6 flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 font-mono text-xs text-muted">
      <span className="size-1.5 shrink-0 rounded-full bg-up" />
      <span className="min-w-0 truncate">
        tracks <span className="text-fg">{shortAddress(ca)}</span> right after you sign in
      </span>
    </div>
  );

  const errorLine = error && (
    <p role="alert" className="mt-3 text-sm text-down">
      {error}
    </p>
  );

  if (step === "code") {
    const wait = Math.min(RESEND_AFTER_MS / 1000, Math.max(0, Math.ceil((sentAt + RESEND_AFTER_MS - now) / 1000)));
    return (
      <Shell
        title="Check your email"
        intro={
          <>
            We sent a sign-in link to <span className="text-fg">{email.trim()}</span>. Open it on this device and
            you&apos;re in.
          </>
        }
      >
        {pending}
        <form onSubmit={verify}>
          <label htmlFor="code" className="label text-subtle">
            Or enter the code from the email
          </label>
          <input
            id="code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 10));
              setError(null);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className={`${INPUT} mt-2 text-center font-mono text-lg tracking-[0.4em]`}
          />
          {errorLine}
          <button type="submit" disabled={code.length < 6 || busy} className={`${PRIMARY} mt-3`}>
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Verify code
          </button>
        </form>
        <div className="mt-6 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className={`${LINK} inline-flex items-center gap-1`}
          >
            <ArrowLeft className="size-3" /> Different email
          </button>
          <button type="button" onClick={() => void send()} disabled={wait > 0 || busy} className={LINK}>
            {wait > 0 ? `Resend in ${wait}s` : "Resend email"}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Sign in to Rankr"
      intro="Pasting a CA needs an account, so every call has a name on the board. We email you a link, no password. New here? The same link creates your account."
    >
      {pending}
      <form onSubmit={send}>
        <label htmlFor="email" className="label text-subtle">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          className={`${INPUT} mt-2`}
        />
        {errorLine}
        <button type="submit" disabled={!email.trim() || busy} className={`${PRIMARY} mt-3`}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}
          Email me a sign-in link
        </button>
      </form>
      <p className="mt-6 text-xs text-subtle">Your email stays private. Only the username you pick is public.</p>
    </Shell>
  );
}
