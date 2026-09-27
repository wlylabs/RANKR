"use client";

import clsx from "clsx";
import { AppWindow, Check, Download, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APP_HOME } from "@/lib/login";
import { promptInstall, useInstallState } from "@/lib/pwa";
import { CopyButton } from "./CopyButton";

const ITEM = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg";

/** The app's full link on this site, e.g. https://rankr.example/app (just the path while server rendering). */
function useAppUrl() {
  const [url, setUrl] = useState(APP_HOME);
  useEffect(() => setUrl(`${window.location.origin}${APP_HOME}`), []);
  return url;
}

/**
 * Header gear: theme, and the app itself (open it, install it, copy its link). The one place for these,
 * so pages stay free of app buttons. `openApp` adds "Open app" (on the landing page).
 */
export function SettingsMenu({ openApp }: { openApp?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const install = useInstallState();
  const appUrl = useAppUrl();

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Settings"
        title="Settings"
        className={clsx(
          "grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg",
          open && "bg-surface-2 text-fg",
        )}
      >
        <Settings className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Settings"
          className="animate-fade-in fixed inset-x-4 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-50 overflow-hidden rounded-lg border border-border bg-bg shadow-lg sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-72"
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="text-sm text-muted">Theme</span>
            <div className="flex rounded-md border border-border p-0.5">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  aria-pressed={resolvedTheme === t}
                  className={clsx(
                    "inline-flex h-6 items-center gap-1.5 rounded px-2 text-xs capitalize transition-colors",
                    resolvedTheme === t ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg",
                  )}
                >
                  {t === "dark" ? <Moon className="size-3" /> : <Sun className="size-3" />}
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border py-1">
            <div className="label px-3 pt-1.5 pb-1 text-subtle">App</div>
            {openApp && (
              <Link href={APP_HOME} role="menuitem" className={ITEM}>
                <AppWindow className="size-3.5" /> Open app
              </Link>
            )}
            {install === "installed" ? (
              <div className={clsx(ITEM, "hover:bg-transparent hover:text-muted")}>
                <Check className="size-3.5 text-up" /> Installed on this device
              </div>
            ) : install === "prompt" ? (
              <button type="button" role="menuitem" onClick={() => void promptInstall()} className={ITEM}>
                <Download className="size-3.5" /> Install app
              </button>
            ) : (
              // No install dialog to show (Safari, Firefox, or not offered yet): say where the browser keeps it.
              <div className="flex items-start gap-2.5 px-3 py-2 text-sm text-muted">
                <Download className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Install app
                  <span className="mt-0.5 block text-xs text-subtle">
                    {install === "ios"
                      ? "In Safari, tap Share, then Add to Home Screen."
                      : "From your browser's menu: Install Rankr, or Add to Home screen."}
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-border px-3 py-2.5">
            <span className="label shrink-0 text-subtle">Link</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{appUrl.replace(/^https?:\/\//, "")}</span>
            <CopyButton value={appUrl} className="shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
