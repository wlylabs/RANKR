"use client";

import clsx from "clsx";
import { House, Plus, Trophy, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { PasteBox } from "./PasteBox";
import { ThemeToggle } from "./ThemeToggle";

export const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/me", label: "My calls", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
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
      <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-16 sm:px-6">
          <Link href="/" aria-label="Rankr home" className="shrink-0">
            <Logo size={26} />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "label rounded-md px-3 py-2 transition-colors",
                  isActive(pathname, href) ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={openDialog}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-fg transition hover:brightness-110 active:translate-y-px"
            >
              <Plus className="size-4" strokeWidth={2.75} />
              Track<span className="hidden sm:inline"> token</span>
            </button>
          </div>
        </div>
      </header>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && closeDialog()}
        className="m-0 mt-auto w-full max-w-none rounded-t-2xl border border-border bg-bg p-0 text-fg backdrop:bg-black/70 sm:m-auto sm:max-w-xl sm:rounded-xl"
        aria-label="Track a token"
      >
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-pixel text-2xl">Track a token</h2>
              <p className="mt-1 text-sm text-muted">Paste a CA. Rankr locks the market cap right now.</p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Close"
            >
              <X className="size-5" />
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "relative flex flex-col items-center justify-center gap-1 font-mono text-[10px] tracking-wider uppercase transition-colors",
                active ? "text-fg" : "text-subtle",
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className="relative grid h-6 place-items-center">
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              </span>
              <span className={clsx("absolute top-0 h-0.5 w-8 bg-brand transition-opacity", active ? "opacity-100" : "opacity-0")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border pb-24 md:pb-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Logo size={20} className="text-fg" />
          <span className="label text-subtle">Paste. Track. Rank.</span>
        </div>
        <p className="font-mono text-[11px] text-subtle">
          Market data from{" "}
          <a href="https://dexscreener.com" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-fg hover:underline">
            DexScreener
          </a>
          . Not financial advice. Memecoins can go to zero.
        </p>
      </div>
    </footer>
  );
}
