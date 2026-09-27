"use client";

import { KeyRound, LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { APP_HOME, LANDING, loginHref } from "@/lib/login";
import { useAuth } from "./AuthProvider";
import { KeyReveal, KeySignInForm } from "./Key";
import { OfficialBadge } from "./OfficialBadge";
import { ProfileSection } from "./ProfileForm";
import { UsernameForm } from "./UsernameForm";

const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-fg px-4 text-sm font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50";
const LINK = "text-muted underline-offset-4 hover:text-fg hover:underline";

/** Save a sign-in key (or make a new one), change the name, bio and links, sign out. */
export function Account() {
  const router = useRouter();
  const { available, ready, userId, username, hasKey, official, signOut } = useAuth();
  const [saved, setSaved] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  // Signing out heads to the landing page, not the sign-in redirect below.
  const [leaving, setLeaving] = useState(false);
  // Kept while the new key is on screen, so it stays up after hasKey flips.
  const [shownKey, setShownKey] = useState<string | null>(null);

  useEffect(() => {
    if (leaving) return;
    if (!available || (ready && (!userId || !username))) router.replace(available ? loginHref("/account") : APP_HOME);
  }, [leaving, available, ready, userId, username, router]);

  if (!ready || !userId || !username) {
    return (
      <div className="pt-14">
        <LoaderCircle className="size-5 animate-spin text-subtle" />
      </div>
    );
  }

  async function out() {
    setLeaving(true);
    await signOut();
    router.replace(LANDING);
  }

  const keyProps = { username, shownKey, setShownKey };
  return (
    <div className="mx-auto max-w-lg pt-10 sm:pt-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Account</h1>
      <p className="mt-1.5 text-sm text-muted">
        You are <span className="font-mono text-fg">@{username}</span>
        {official && <OfficialBadge className="ml-1" />} on the caller board
        {official ? ", as an official account." : hasKey ? "." : ", as a guest."}
      </p>

      {hasKey && !shownKey ? <KeySection {...keyProps} /> : <SaveKey {...keyProps} />}

      {official ? (
        <section className="mt-6 rounded-lg border border-border p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <OfficialBadge /> Official account
          </h2>
          <p className="mt-1 text-sm text-muted">
            The badge vouches for this name, so it can&apos;t be changed here. The project owner manages it in the
            database.
          </p>
        </section>
      ) : (
        <section className="mt-6 rounded-lg border border-border p-5">
          <h2 className="text-sm font-medium">Change username</h2>
          <p className="mt-1 mb-5 text-sm text-muted">Your calls move with you. The old name becomes free for others.</p>
          <UsernameForm key={username} initial={username} current={username} submitLabel="Save username" onSaved={() => setSaved(true)} />
          {saved && <p className="mt-3 text-xs text-up">Saved.</p>}
        </section>
      )}

      <ProfileSection userId={userId} username={username} />

      {confirmOut ? (
        <div className="mt-6 rounded-lg border border-down/40 p-4">
          <p className="text-sm">
            {hasKey ? (
              <>You&apos;ll need your key to sign back in as <span className="font-mono">@{username}</span>.</>
            ) : (
              <>
                Without a key you can&apos;t sign back in. <span className="font-mono">@{username}</span> and its calls stay
                on the board but you lose access. Save your key first to keep it.
              </>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={out}
              className="h-8 rounded-md border border-border px-3 text-sm text-down transition-colors hover:bg-surface-2"
            >
              {hasKey ? "Sign out" : "Sign out anyway"}
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
          onClick={() => setConfirmOut(true)}
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      )}
    </div>
  );
}

type KeyProps = { username: string; shownKey: string | null; setShownKey: (key: string | null) => void };

function useMakeKey(setShownKey: (key: string) => void) {
  const { makeKey } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      setShownKey(await makeKey());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-3 text-sm text-down">
      {error}
    </p>
  ) : null;
}

/** Guest -> keyed account (same user, so the name and calls stay), or switch to an account you have a key for. */
function SaveKey({ username, shownKey, setShownKey }: KeyProps) {
  const make = useMakeKey(setShownKey);
  const [switching, setSwitching] = useState(false);

  return (
    <section className="mt-8 rounded-lg border border-border-strong bg-surface p-5">
      <h2 className="text-sm font-medium">{shownKey ? "Your key" : "Save your key"}</h2>
      {shownKey ? (
        <KeyReveal value={shownKey} username={username} onDone={() => setShownKey(null)} />
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            A guest account lives in this browser only. Clear your browser data or switch devices and it&apos;s gone. A
            key signs you in anywhere, no email or password; your name and calls stay the same.
          </p>
          <button type="button" onClick={make.run} disabled={make.busy} className={`${PRIMARY} mt-5`}>
            {make.busy ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Make my key
          </button>
          <ErrorLine error={make.error} />
          <div className="mt-5 border-t border-border pt-4 text-xs">
            {switching ? (
              <>
                <p className="mb-4 text-sm text-muted">
                  This browser switches to the account the key belongs to.{" "}
                  <span className="font-mono text-fg">@{username}</span> stays on the board, but without a key you
                  can&apos;t come back to it.
                </p>
                <KeySignInForm autoFocus />
                <button type="button" onClick={() => setSwitching(false)} className={`${LINK} mt-3`}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setSwitching(true)} className={LINK}>
                Already have a key? Sign in with it
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** A keyed account: the key can't be shown again, only replaced. */
function KeySection({ setShownKey }: KeyProps) {
  const make = useMakeKey(setShownKey);
  const [confirm, setConfirm] = useState(false);

  return (
    <section className="mt-8 rounded-lg border border-border p-5">
      <h2 className="text-sm font-medium">Sign-in key</h2>
      <p className="mt-1 text-sm text-muted">
        Your key is the only way back into this account. Rankr keeps only a hash of it, so it can&apos;t show it again.
      </p>
      {confirm ? (
        <div className="mt-4 rounded-md border border-border p-3">
          <p className="text-sm">Your current key stops working right away and other devices are signed out.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={make.run}
              disabled={make.busy}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-fg px-3 text-sm font-medium text-bg hover:opacity-85 disabled:opacity-50"
            >
              {make.busy && <LoaderCircle className="size-3.5 animate-spin" />}
              Make a new key
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="h-8 rounded-md px-3 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
          <ErrorLine error={make.error} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Lost it, or someone else might have it?{" "}
          <button type="button" onClick={() => setConfirm(true)} className="text-fg underline-offset-4 hover:underline">
            Make a new key
          </button>
          .
        </p>
      )}
    </section>
  );
}
