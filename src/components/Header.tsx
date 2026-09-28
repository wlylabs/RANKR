"use client";

import clsx from "clsx";
import { House, Newspaper, Plus, Radio, Trophy, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APP_HOME } from "@/lib/login";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { PasteBox } from "./PasteBox";
import { SettingsMenu } from "./SettingsMenu";

export const NAV = [
  { href: APP_HOME, label: "Home", icon: House },
  { href: "/feed", label: "Feed", icon: Radio },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/me", label: "You", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  return href === APP_HOME ? pathname === APP_HOME : pathname.startsWith(href);
}

export function Header() {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const openDialog = () => {
    setOpen(true);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  // Following a link out of the dialog (e.g. to the token page) should close it.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href={APP_HOME} aria-label="Rankr home" className="shrink-0">
            <Logo size={24} />
          </Link>
          <nav className="hidden items-center gap-5 md:flex" aria-label="Main">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={clsx(
                  "text-sm transition-colors",
                  isActive(pathname, href) ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SettingsMenu />
            <AccountMenu />
            <button
              type="button"
              onClick={openDialog}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-sm font-medium text-bg transition-opacity hover:opacity-85"
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              Track
            </button>
          </div>
        </div>
      </header>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && closeDialog()}
        className="m-0 mt-auto w-full max-w-none rounded-t-xl border border-border bg-bg p-0 text-fg backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-xl"
        aria-label="Track a token"
      >
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold tracking-tight">Track a token</h2>
              <p className="mt-0.5 text-sm text-muted">The entry is sealed the moment you paste.</p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          {open && <PasteBox autoFocus size="md" />}
        </div>
      </dialog>
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="mx-auto grid h-14 max-w-md grid-cols-5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                active ? "text-fg" : "text-subtle",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.7} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
