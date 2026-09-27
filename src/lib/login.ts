// Where to go after signing in. Only same-site paths, so /login?next=... can't bounce people elsewhere.

export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export function loginHref(next?: string): string {
  const to = safeNext(next, "");
  return to && to !== "/" ? `/login?next=${encodeURIComponent(to)}` : "/login";
}

/** Sign in, then come back to the home page and track `ca`. */
export function loginToPaste(ca: string): string {
  return loginHref(`/?ca=${encodeURIComponent(ca.trim())}`);
}

/** A readable message for a Supabase Auth error. */
export function authErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  switch (err?.code) {
    case "otp_expired":
      return "That code is wrong or has expired. Get a new one.";
    case "over_email_send_rate_limit":
      return "Too many sign-in emails right now. Try again in a few minutes.";
    case "email_address_invalid":
      return "That email address doesn't look right.";
    case "signup_disabled":
    case "otp_disabled":
      return "New sign-ups are closed right now.";
    case "over_request_rate_limit":
      return "Too many attempts. Wait a moment and try again.";
    case "anonymous_provider_disabled":
      return "Guest accounts are turned off here. Sign in with email instead.";
    case "email_exists":
      return "That email already has a Rankr account. Sign out and sign in with it instead.";
  }
  return err?.message || "Something went wrong. Try again.";
}
