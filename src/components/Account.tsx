"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loginHref } from "@/lib/login";
import { useAuth } from "./AuthProvider";
import { UsernameForm } from "./UsernameForm";

/** Change the username, see the sign-in email, sign out. */
export function Account() {
  const router = useRouter();
  const { available, ready, userId, email, username, signOut } = useAuth();
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="mx-auto max-w-lg pt-10 sm:pt-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Account</h1>
      <p className="mt-1.5 text-sm text-muted">
        You are <span className="font-mono text-fg">@{username}</span> on the caller board.
      </p>

      <section className="mt-8 rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Change username</h2>
        <p className="mt-1 mb-5 text-sm text-muted">Your calls move with you. The old name becomes free for others.</p>
        <UsernameForm key={username} initial={username} current={username} submitLabel="Save username" onSaved={() => setSaved(true)} />
        {saved && <p className="mt-3 text-xs text-up">Saved.</p>}
      </section>

      <section className="mt-6 rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Email</h2>
        <p className="mt-1 font-mono text-sm break-all text-muted">{email}</p>
        <p className="mt-2 text-xs text-subtle">Private. Only used to send your sign-in links.</p>
      </section>

      <button
        type="button"
        onClick={async () => {
          await signOut();
          router.replace("/");
        }}
        className="mt-6 inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <LogOut className="size-3.5" /> Sign out
      </button>
    </div>
  );
}
