"use client";

import clsx from "clsx";
import { RotateCcw, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

/** Header chip with the caller's anonymous handle. Shown once they have one (after a paste). */
export function IdentityChip() {
  const { available, handle, resetIdentity } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  if (!available || !handle) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Your anonymous id"
        className={clsx(
          "inline-flex h-8 items-center gap-2 rounded-md border border-border px-2.5 font-mono text-xs transition-colors hover:bg-surface-2",
          open && "bg-surface-2",
        )}
      >
        <span className="size-1.5 rounded-full bg-up" />
        {handle}
      </button>
      {open && (
        <div className="animate-fade-in absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-bg shadow-lg">
          <div className="border-b border-border px-3 py-2.5">
            <div className="font-mono text-xs">{handle}</div>
            <p className="mt-1 text-xs text-muted">
              Your anonymous id on this browser. Your pastes count as calls on the caller board. No wallet, no email.
            </p>
          </div>
          <Link
            href="/me"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
          >
            <UserRound className="size-3.5" /> My calls
          </Link>
          {confirming ? (
            <div className="border-t border-border px-3 py-2.5">
              <p className="text-xs text-muted">
                Start fresh? Calls under {handle} stay on the board, but this browser won&apos;t be able to see them again.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void resetIdentity();
                  }}
                  className="h-7 rounded-md bg-fg px-2.5 text-xs font-medium text-bg hover:opacity-85"
                >
                  New id
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-7 rounded-md border border-border px-2.5 text-xs text-muted hover:text-fg"
                >
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg"
            >
              <RotateCcw className="size-3.5" /> New anonymous id
            </button>
          )}
        </div>
      )}
    </div>
  );
}
