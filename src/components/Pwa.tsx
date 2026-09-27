"use client";

import clsx from "clsx";
import { ArrowRight, Check, Download, SquarePlus, Share } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { APP_HOME } from "@/lib/login";
import { promptInstall, useInstallState } from "@/lib/pwa";
import { CopyButton } from "./CopyButton";

/** Registers the service worker (production only: in dev it would serve stale pages). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* not installable here (e.g. http), the site works the same */
    });
  }, []);
  return null;
}

const SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-2";

/** "Install app": the browser's own dialog where there is one, otherwise a link to the steps at #install. */
export function InstallButton({ className }: { className?: string }) {
  const state = useInstallState();
  if (state === "installed") return null;
  if (state === "prompt") {
    return (
      <button type="button" onClick={() => void promptInstall()} className={clsx(SECONDARY, className)}>
        <Download className="size-4" />
        Install app
      </button>
    );
  }
  return (
    <a href="#install" className={clsx(SECONDARY, className)}>
      <Download className="size-4" />
      Install app
    </a>
  );
}

/** The app's full link on this site, e.g. https://rankr.example/app (just the path while server rendering). */
function useAppUrl() {
  const [url, setUrl] = useState(APP_HOME);
  useEffect(() => setUrl(`${window.location.origin}${APP_HOME}`), []);
  return url;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="tabular mt-px font-mono text-xs text-subtle">0{n}</span>
      <span className="text-sm text-muted">{children}</span>
    </li>
  );
}

/** The install section's panel: what to do on this device, and the app's link. */
export function InstallPanel() {
  const state = useInstallState();
  const appUrl = useAppUrl();

  return (
    <div className="rounded-lg border border-border">
      <div className="p-5 sm:p-6">
        {state === "installed" ? (
          <p className="flex items-center gap-2 text-sm">
            <Check className="size-4 text-up" /> Rankr is installed on this device. Open it from your home screen or
            app list.
          </p>
        ) : state === "prompt" ? (
          <>
            <p className="text-sm text-muted">Your browser can install Rankr right now.</p>
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-fg text-sm font-medium text-bg transition-opacity hover:opacity-85 sm:w-auto sm:px-5"
            >
              <Download className="size-4" />
              Install Rankr
            </button>
          </>
        ) : state === "ios" ? (
          <ol className="space-y-3">
            <Step n={1}>
              Open this page in Safari and tap <Share className="inline size-4 -translate-y-px text-fg" aria-label="Share" />{" "}
              <span className="text-fg">Share</span>.
            </Step>
            <Step n={2}>
              Choose <SquarePlus className="inline size-4 -translate-y-px text-fg" aria-hidden />{" "}
              <span className="text-fg">Add to Home Screen</span>, then <span className="text-fg">Add</span>.
            </Step>
            <Step n={3}>Open Rankr from your home screen. It starts full screen, on the paste box.</Step>
          </ol>
        ) : (
          <ol className="space-y-3">
            <Step n={1}>
              <span className="text-fg">Chrome, Edge, Brave</span>: the install icon at the end of the address bar, or
              the menu → <span className="text-fg">Install Rankr</span>.
            </Step>
            <Step n={2}>
              <span className="text-fg">Android</span>: the menu → <span className="text-fg">Add to Home screen</span>{" "}
              (or <span className="text-fg">Install app</span>).
            </Step>
            <Step n={3}>
              <span className="text-fg">iPhone, iPad</span>: Safari → Share → <span className="text-fg">Add to Home Screen</span>.{" "}
              <span className="text-fg">Safari on Mac</span>: File → <span className="text-fg">Add to Dock</span>.
            </Step>
          </ol>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-border px-5 py-3 sm:px-6">
        <span className="label shrink-0 text-subtle">App link</span>
        <Link href={APP_HOME} className="min-w-0 flex-1 truncate font-mono text-xs text-fg hover:underline">
          {appUrl.replace(/^https?:\/\//, "")}
        </Link>
        <CopyButton value={appUrl} className="shrink-0" />
        <Link href={APP_HOME} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted hover:text-fg">
          Open <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
