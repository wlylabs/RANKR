"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { APP_HOME, loginHref } from "@/lib/login";
import { useAuth } from "../AuthProvider";

/**
 * Who may open Trace: official accounts only (the project's own, see rankr_set_official), and everyone where
 * accounts aren't set up (local dev). "loading" until the account is read. The API checks the same
 * (requireTraceAccess); this only keeps the tab out of sight.
 */
export function useTraceAccess(): "loading" | "open" | "closed" {
  const { available, ready, official } = useAuth();
  if (!available) return "open";
  if (!ready) return "loading";
  return official ? "open" : "closed";
}

/** The Trace tab's pages, for those who may open it; a short note for everyone else. */
export function TraceGate({ children }: { children: ReactNode }) {
  const access = useTraceAccess();
  const { userId } = useAuth();
  if (access === "open") return children;
  if (access === "loading") return <div className="min-h-[60vh]" aria-busy />;
  return (
    <div className="pt-8 sm:pt-12">
      <div className="mx-auto max-w-md rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <Lock className="mx-auto size-5 text-subtle" />
        <h1 className="mt-3 font-medium">Trace is private</h1>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
          It&apos;s open to Rankr&apos;s own account only for now.
        </p>
        <Link
          href={userId ? APP_HOME : loginHref("/trace")}
          className="mt-5 inline-flex h-9 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-85"
        >
          {userId ? "Back to Rankr" : "Sign in"}
        </Link>
      </div>
    </div>
  );
}
