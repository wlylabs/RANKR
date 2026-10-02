"use client";

import clsx from "clsx";
import { GitCommitVertical, House, Plus, Radio, Trophy, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APP_HOME } from "@/lib/login";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { PasteBox } from "./PasteBox";
import { SettingsMenu } from "./SettingsMenu";
import { useTraceAccess } from "./trace/TraceGate";

export const NAV = [
  { href: APP_HOME, label: "Home", icon: House },
  { href: "/feed", label: "Feed", icon: Radio },
  { href: "/trace", label: "Trace", icon: GitCommitVertical, private: true },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/me", label: "You", icon: UserRound },
];

/** The nav as this account sees it: Trace only for those who may open it (official accounts). */
function useNav() {
  const trace = useTraceAccess() === "open";
  return NAV.filter((n) => !n.private || trace);
}

function isActive(pathname: string, href: string) {
  return href === APP_HOME ? pathname === APP_HOME : pathname.startsWith(href);
}

/**
 * The desktop nav: its links, the page you're on marked by a line on the header's bottom edge. Nothing in it
 * moves, like any other app's: no hover pill, no line gliding from page to page.
 */
function NavLinks({ pathname }: { pathname: string }) {
  const nav = useNav();
  return (
    <nav aria-label="Main" className="hidden items-stretch self-stretch md:flex">
      {nav.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={clsx("relative flex items-center px-3 text-sm", active ? "text-fg" : "text-muted hover:text-fg")}
          >
            {label}
            {active && <span aria-hidden className="absolute inset-x-0 -bottom-px h-px bg-fg" />}
          </Link>
        );
      })}
    </nav>
  );
}

/** "⌘" on Apple devices, "Ctrl " elsewhere; null until known (it's read in the browser). */
function useModKey() {
  const [mod, setMod] = useState<string | null>(null);
  useEffect(() => setMod(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘" : "Ctrl "), []);
  return mod;
}

export function Header() {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Bumped on every open: the paste box starts fresh each time, but stays on screen while the dialog closes.
  const [session, setSession] = useState(0);
  const mod = useModKey();

  const openDialog = () => {
    setSession((n) => n + 1);
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  // Following a link out of the dialog (e.g. to the token page) should close it.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  // ⌘K / Ctrl+K opens (and closes) Track from anywhere, like a trading terminal's command bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      const dialog = dialogRef.current;
      if (dialog?.open) dialog.close();
      else {
        setSession((n) => n + 1);
        dialog?.showModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href={APP_HOME} aria-label="Rankr home" className="mr-2 shrink-0 rounded-md">
            <Logo size={24} />
          </Link>
          <NavLinks pathname={pathname} />
          <div className="ml-auto flex items-center gap-2">
            <SettingsMenu />
            <AccountMenu />
            <button
              type="button"
              onClick={openDialog}
              aria-keyshortcuts="Meta+K Control+K"
              title={mod ? `Track a token (${mod}K)` : undefined}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-sm font-medium text-bg transition-opacity hover:opacity-85"
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              Track
              {mod && (
                <kbd
                  aria-hidden
                  className="ml-0.5 hidden rounded-[4px] bg-bg/15 px-1 font-mono text-[10px] leading-4 font-normal text-bg/70 lg:pointer-fine:inline"
                >
                  {mod}K
                </kbd>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* A sheet from the bottom on phones, a card in the middle from sm up (.sheet). */}
      <dialog
        ref={dialogRef}
        onClick={(e) => e.target === e.currentTarget && closeDialog()}
        className="sheet m-0 mt-auto w-full max-w-none rounded-t-2xl border border-border bg-bg p-0 text-fg shadow-float sm:m-auto sm:max-w-lg sm:rounded-xl"
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
          {session > 0 && <PasteBox key={session} autoFocus size="md" />}
        </div>
      </dialog>
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const nav = useNav();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className={clsx("mx-auto grid h-14 max-w-md", nav.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center justify-center gap-0.5 text-[11px]",
                active ? "text-fg" : "text-subtle",
              )}
              aria-current={active ? "page" : undefined}
            >
              {/* No pill and no motion: the tab you're on is the one in full color, its icon drawn bolder. */}
              <span className="grid h-7 w-14 place-items-center">
                <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.7} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
