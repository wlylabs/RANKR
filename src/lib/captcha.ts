"use client";

// Cloudflare Turnstile for the two ways into an account (continue as guest, sign in with a key), when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Invisible for almost everyone: the widget only shows (bottom of
// the screen) when Cloudflare wants an interaction. The token goes to Supabase Auth, which checks it with
// the secret key set under Authentication -> Attack Protection. Tokens are single use, so each sign-in
// gets a fresh one. Without the site key, sign-in works as before (no captcha).

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TIMEOUT_MS = 120_000;

type RenderOptions = {
  sitekey: string;
  appearance: "interaction-only";
  theme: "light" | "dark";
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
};
type Turnstile = { render(el: HTMLElement, options: RenderOptions): string; remove(widgetId: string): void };

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export const captchaEnabled = Boolean(SITE_KEY);

let loading: Promise<Turnstile> | null = null;

function load(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile didn't start.")));
    s.onerror = () => {
      loading = null; // let the next attempt try again
      reject(new Error("Couldn't load the human check. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** A fresh Turnstile token for one sign-in, or undefined when captcha isn't set up on this deployment. */
export async function captchaToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  const turnstile = await load();

  return new Promise<string>((resolve, reject) => {
    // Where the widget appears if Cloudflare asks for a click: bottom center, above everything.
    const host = document.createElement("div");
    host.setAttribute("style", "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100");
    document.body.appendChild(host);

    let widget: string | null = null;
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Removed after the callback returns, as Turnstile may still be running it.
      setTimeout(() => {
        if (widget) turnstile.remove(widget);
        host.remove();
      }, 0);
      settle();
    };
    const fail = (message = "Couldn't verify you're human. Try again.") => finish(() => reject(new Error(message)));
    const timer = setTimeout(() => fail("The human check took too long. Try again."), TIMEOUT_MS);

    widget = turnstile.render(host, {
      sitekey: SITE_KEY,
      appearance: "interaction-only",
      theme: document.documentElement.classList.contains("light") ? "light" : "dark",
      callback: (token) => finish(() => resolve(token)),
      "error-callback": () => fail(),
      "expired-callback": () => fail(),
      "timeout-callback": () => fail(),
    });
  });
}
