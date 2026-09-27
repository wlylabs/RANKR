"use client";

import clsx from "clsx";
import { AppWindow, Bell, Check, Download, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { APP_HOME } from "@/lib/login";
import { alertsSupported, setAlerts, useAlertsOn } from "@/lib/alerts";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const install = useInstallState();
  const appUrl = useAppUrl();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
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
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
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
          id={panelId}
          role="group"
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

          <AlertsSwitch />

          <div className="border-t border-border py-1">
            <div className="label px-3 pt-1.5 pb-1 text-subtle">App</div>
            {openApp && (
              <Link href={APP_HOME} className={ITEM}>
                <AppWindow className="size-3.5" /> Open app
              </Link>
            )}
            {install === "installed" ? (
              <div className={clsx(ITEM, "hover:bg-transparent hover:text-muted")}>
                <Check className="size-3.5 text-up" /> Installed on this device
              </div>
            ) : install === "prompt" ? (
              <button type="button" onClick={() => void promptInstall()} className={ITEM}>
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
            <CopyButton value={appUrl} what="app link" className="shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Milestone alerts on / off. Hidden where the browser has no notifications (e.g. Safari tabs on iPhone). */
function AlertsSwitch() {
  const on = useAlertsOn();
  const [supported, setSupported] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    setSupported(alertsSupported());
    setBlocked(alertsSupported() && Notification.permission === "denied");
  }, [on]);
  if (!supported) return null;

  return (
    <div className="flex items-start gap-2.5 border-t border-border px-3 py-2.5">
      <Bell className="mt-0.5 size-3.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-muted">Milestone alerts</div>
        <div className="mt-0.5 text-xs text-subtle">
          {blocked
            ? "Notifications are blocked for this site in your browser settings."
            : "2x, 5x, 10x and up on your calls and watchlist, while Rankr is open."}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Milestone alerts"
        disabled={blocked}
        onClick={async () => {
          const now = await setAlerts(!on);
          setBlocked(!now && Notification.permission === "denied");
        }}
        className={clsx(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-40",
          on ? "border-fg bg-fg" : "border-border bg-surface-2",
        )}
      >
        <span
          className={clsx(
            "absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full transition-all",
            on ? "left-[1.1rem] bg-bg" : "left-0.5 bg-subtle",
          )}
        />
      </button>
    </div>
  );
}
