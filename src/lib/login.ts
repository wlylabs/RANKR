// Where to go after signing in. Only same-site paths, so /login?next=... can't bounce people elsewhere.

/** The app's home: the paste box and the live board. The landing page is at /. */
export const APP_HOME = "/app";

/** The landing page. Signing out ends up here. */
export const LANDING = "/";

export function safeNext(next: string | null | undefined, fallback = APP_HOME): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export function loginHref(next?: string): string {
  const to = safeNext(next, "");
  return to && to !== "/" && to !== APP_HOME ? `/login?next=${encodeURIComponent(to)}` : "/login";
}

/** Sign in, then come back to the app and track `ca`. */
export function loginToPaste(ca: string): string {
  return loginHref(`${APP_HOME}?ca=${encodeURIComponent(ca.trim())}`);
}

/** A readable message for a Supabase Auth error. */
export function authErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  switch (err?.code) {
    case "invalid_credentials":
      return "No account has that key. Check it and try again.";
    case "over_request_rate_limit":
      return "Too many attempts. Wait a moment and try again.";
    case "anonymous_provider_disabled":
      return "Guest accounts are turned off here.";
    case "email_provider_disabled":
      return "Signing in with a key is turned off here.";
    case "signup_disabled":
      return "New accounts are closed right now.";
    case "captcha_failed":
      return "Couldn't verify you're human. Try again.";
  }
  return err?.message || "Something went wrong. Try again.";
}
