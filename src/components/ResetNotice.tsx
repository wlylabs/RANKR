"use client";

import { Hourglass, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useMounted, useNow } from "@/lib/hooks";
import { resetDay, resetSoon, untilLabel } from "@/lib/reset";
import { accountsAvailable } from "@/lib/supabase-browser";
import { useAuth } from "./AuthProvider";

const DISMISSED_KEY = "rankr:reset-notice:dismissed";

function readDismissed(): number | null {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

/**
 * The day before the monthly reset, a strip under the header: when it comes, that every token and call goes,
 * and (signed in) that the month is kept as a private recap. Closing it hides it until the next reset. Only
 * with accounts (the reset runs in Supabase), and only once mounted: the time is the visitor's, not the build's.
 */
export function ResetNotice() {
  const mounted = useMounted();
  const [closed, setClosed] = useState<number | null>(null);
  const now = useNow(60_000);
  const { userId } = useAuth();

  if (!accountsAvailable || !mounted) return null;
  const at = resetSoon(now);
  if (at === null || at === (closed ?? readDismissed())) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(at));
    } catch {
      /* storage blocked: hidden until the page reloads */
    }
    setClosed(at);
  }

  return (
    <aside aria-label="Monthly reset" className="border-b border-border bg-surface-2">
      <div className="mx-auto flex max-w-6xl items-start gap-2.5 px-4 py-2 text-xs sm:items-center sm:px-6">
        <Hourglass className="mt-0.5 size-3.5 shrink-0 text-muted sm:mt-0" />
        <p className="min-w-0 flex-1 text-muted">
          <span className="font-medium text-fg">Rankr resets in {untilLabel(at, now)}</span>
          <span className="font-mono text-subtle"> · {resetDay(at)}, 00:00 UTC</span>. Every token and call is cleared
          {userId ? (
            <>
              ; your month is kept as a{" "}
              <Link href="/me?tab=recaps" className="text-fg underline-offset-4 hover:underline">
                private recap
              </Link>
              .
            </>
          ) : (
            "."
          )}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="-m-1 shrink-0 rounded p-1 text-subtle transition-colors hover:text-fg"
          aria-label="Hide until the next reset"
          title="Hide until the next reset"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}
