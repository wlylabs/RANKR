"use client";

import { LoaderCircle, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/format";
import { APP_HOME, LANDING, safeNext } from "@/lib/login";
import { useAuth } from "./AuthProvider";
import { KeySignInForm } from "./Key";
import { LogoMark } from "./Logo";
import { UsernameForm } from "./UsernameForm";

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

/** Continue as a guest in one click, or sign in with a key. Pasting needs an account. */
export function Login() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const ca = new URL(next, "http://rankr").searchParams.get("ca");
  const { available, ready, userId, username, continueAsGuest, signOut } = useAuth();
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  const done = ready && !!userId && !!username;
  useEffect(() => {
    if (done) router.replace(next);
  }, [done, next, router]);

  async function guest() {
    if (guestBusy) return;
    setGuestBusy(true);
    setGuestError(null);
    try {
      await continueAsGuest();
    } catch (err) {
      setGuestError((err as Error).message);
      setGuestBusy(false);
    }
  }

  if (!available) {
    return (
      <Shell title="Accounts are off" intro="This deployment has no Supabase Auth configured, so pasting works without an account.">
        <Link href={APP_HOME} className={PRIMARY}>
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
      <Shell title="Pick a username" intro="This is how you show up on the caller board.">
        <UsernameForm submitLabel="Continue" />
        <p className="mt-6 text-xs text-subtle">
          <button type="button" onClick={async () => {
              await signOut();
              router.replace(LANDING);
            }} className={LINK}>
            Sign out
          </button>
        </p>
      </Shell>
    );
  }

  return (
    <Shell
      title="Sign in to Rankr"
      intro="Pasting a CA needs an account, so every call on the board has a name behind it."
    >
      {ca && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 font-mono text-xs text-muted">
          <span className="size-1.5 shrink-0 rounded-full bg-up" />
          <span className="min-w-0 truncate">
            tracks <span className="text-fg">{shortAddress(ca)}</span> right after you sign in
          </span>
        </div>
      )}
      <button type="button" onClick={guest} disabled={guestBusy} className={PRIMARY}>
        {guestBusy ? <LoaderCircle className="size-4 animate-spin" /> : <UserRound className="size-4" />}
        Continue as guest
      </button>
      <p className="mt-2 text-xs text-subtle">
        One click. You get a name like <span className="font-mono text-muted">@nonce_7f3a</span>, kept in this browser.
        Save a key any time to sign in anywhere.
      </p>
      {guestError && (
        <p role="alert" className="mt-2 text-sm text-down">
          {guestError}
        </p>
      )}

      <div className="my-6 flex items-center gap-3 font-mono text-[11px] text-subtle">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <KeySignInForm />
      <p className="mt-6 text-xs text-subtle">
        No email, no password. Your key is the only way back into your account, so keep it safe: a lost key
        can&apos;t be recovered.
      </p>
    </Shell>
  );
}
