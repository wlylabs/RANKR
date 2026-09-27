// A caller's profile beyond the name: a short bio, an X account and a Telegram username. Rules shared by
// the browser (instant feedback) and the server; SQL enforces the same (…_rankr_profile.sql).
//
// The X account shows on the public profile only once verified: a public post from that X account
// carrying the code for this Rankr account (xCode), so nobody can pass for someone else's X account.
import { sha256Hex } from "./sha256";
import type { CallerAbout } from "./types";

export const BIO_MAX = 160;

export const X_HELP = "Up to 15 letters, numbers or underscores.";
export const TELEGRAM_HELP = "5-32 letters, numbers or underscores, starting with a letter.";

const X_RE = /^[A-Za-z0-9_]{1,15}$/;
const TELEGRAM_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

/** "@name", "name" or a link to the profile (x.com/name, t.me/name...) -> "name". */
function handleIn(input: string, hosts: RegExp): string {
  const s = input.trim();
  const link = s.match(new RegExp(`^(?:https?://)?(?:www\\.|mobile\\.)?${hosts.source}/@?([^/?#\\s]+)/?(?:[?#].*)?$`, "i"));
  return (link ? link[1] : s).replace(/^@/, "");
}

/** The bio as stored: spaces and line breaks collapsed, trimmed. Empty -> null. */
export function cleanBio(input: string): string | null {
  return input.replace(/\s+/g, " ").trim() || null;
}

/** The X username in `input` (see handleIn). Empty -> null; undefined when it isn't one. */
export function parseX(input: string): string | null | undefined {
  const name = handleIn(input, /(?:x|twitter)\.com/);
  if (!name) return null;
  return X_RE.test(name) ? name : undefined;
}

/** The Telegram username in `input` (see handleIn). Empty -> null; undefined when it isn't one. */
export function parseTelegram(input: string): string | null | undefined {
  const name = handleIn(input, /(?:t|telegram)\.me/);
  if (!name) return null;
  return TELEGRAM_RE.test(name) ? name : undefined;
}

export type ProfileInput = { bio: string; x: string; telegram: string };
export type ProfileFields = Omit<CallerAbout, "xVerified">;
export type ProfileProblem = { field: keyof ProfileInput; error: string };

/** The profile to store, or what's wrong with it. */
export function checkProfile(input: ProfileInput): { ok: true; profile: ProfileFields } | ({ ok: false } & ProfileProblem) {
  const bio = cleanBio(input.bio);
  if (bio && [...bio].length > BIO_MAX) return { ok: false, field: "bio", error: `Keep your bio to ${BIO_MAX} characters.` };
  const x = parseX(input.x);
  if (x === undefined) return { ok: false, field: "x", error: `That isn't an X username. ${X_HELP}` };
  const telegram = parseTelegram(input.telegram);
  if (telegram === undefined) return { ok: false, field: "telegram", error: `That isn't a Telegram username. ${TELEGRAM_HELP}` };
  return { ok: true, profile: { bio, x, telegram } };
}

/**
 * The code a post from the X account must carry to verify it for this Rankr account. Tied to both, so a
 * post that verified one account proves nothing for another. Same in the browser and on the server.
 */
export function xCode(userId: string, x: string): string {
  return `rankr-${sha256Hex(`rankr/x:${userId}:${x.toLowerCase()}`).slice(0, 10)}`;
}

/** The post to publish on X: a link to the Rankr profile and the code. */
export function xPostText(code: string, profileUrl: string): string {
  return `Verifying my Rankr caller profile: ${profileUrl}\n\n${code}`;
}

/** The id of the post in a link to it (x.com/name/status/123, twitter.com/..., with or without extras), or null. */
export function parsePostId(input: string): string | null {
  const m = input
    .trim()
    .match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:[A-Za-z0-9_]{1,15}|i(?:\/web)?)\/status(?:es)?\/(\d{1,20})(?:[/?#].*)?$/i);
  return m ? m[1] : null;
}
