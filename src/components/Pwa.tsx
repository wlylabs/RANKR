"use client";

import { useEffect } from "react";
// Imported here, on every page, so the install prompt is caught as early as possible.
import "@/lib/pwa";

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
