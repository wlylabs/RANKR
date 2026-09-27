"use client";

import clsx from "clsx";
import { KeyRound, LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loginHref } from "@/lib/login";
import { useAuth } from "./AuthProvider";

const ITEM = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg";

/** Header: "Sign in" when signed out, the username with a menu when signed in. */
export function AccountMenu() {
  const { available, ready, userId, email, username, guest, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
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

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) setConfirmOut(false);
  }, [open]);

  if (!available) return null;
  if (!ready) return <span className="h-8 w-8 sm:w-16" aria-hidden />;
  if (pathname === "/login") return null;

  if (!userId || !username) {
    return (
      <Link
        href={loginHref(pathname)}
        className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        {userId ? "Pick username" : "Sign in"}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account: @${username}`}
        className={clsx(
          "inline-flex h-8 items-center gap-2 rounded-md border border-border pr-1 pl-1 font-mono text-xs transition-colors hover:bg-surface-2 sm:pr-2.5",
          open && "bg-surface-2",
        )}
      >
        <span className="grid size-6 place-items-center rounded bg-surface-2 text-[11px] font-medium text-fg uppercase">
          {username[0]}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">@{username}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-bg shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <div className="truncate font-mono text-xs text-fg">@{username}</div>
            <div className="mt-0.5 truncate text-xs text-subtle">{guest ? "Guest · this browser only" : email}</div>
          </div>
          {guest && (
            <Link href="/account" role="menuitem" className={clsx(ITEM, "text-fg")}>
              <KeyRound className="size-3.5" /> Keep account: add email
            </Link>
          )}
          <Link href="/me" role="menuitem" className={ITEM}>
            <UserRound className="size-3.5" /> My calls
          </Link>
          <Link href="/account" role="menuitem" className={ITEM}>
            <Settings className="size-3.5" /> Account
          </Link>
          {confirmOut ? (
            <div className="border-t border-border px-3 py-2.5">
              <p className="text-xs text-muted">
                Guests can&apos;t sign back in. You&apos;ll lose access to @{username}.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setOpen(false);
                    await signOut();
                    router.refresh();
                  }}
                  className="h-7 rounded-md border border-border px-2.5 text-xs text-down hover:bg-surface-2"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOut(false)}
                  className="h-7 rounded-md px-2.5 text-xs text-muted hover:text-fg"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                if (guest) return setConfirmOut(true);
                setOpen(false);
                await signOut();
                router.refresh();
              }}
              className={clsx(ITEM, "border-t border-border")}
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
