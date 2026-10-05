"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { loginHref } from "@/lib/login";
import { useAuth } from "../AuthProvider";

/**
 * The Trace tab's pages, for every account (each traces on its own API keys, see /trace/keys), and everyone
 * where accounts aren't set up (local dev); a note to sign in for anyone else.
 */
export function TraceGate({ children }: { children: ReactNode }) {
  const { available, ready, userId } = useAuth();
  if (!available || userId) return children;
  if (!ready) return <div className="min-h-[60vh]" aria-busy />;
  return (
    <div className="pt-8 sm:pt-12">
      <div className="mx-auto max-w-md rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <Lock className="mx-auto size-5 text-subtle" />
        <h1 className="mt-3 font-medium">Sign in to trace</h1>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Trace reads the chains on your own free API keys.</p>
        <Link
          href={loginHref("/trace")}
          className="mt-5 inline-flex h-9 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-85"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
