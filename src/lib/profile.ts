// Profile rules (a short bio and links), shared by the browser (instant feedback) and the server. SQL enforces
// the same limits (rankr_profile_problem).

export const BIO_MAX = 160;
export const LINKS_MAX = 8;
export const LINK_LABEL_MAX = 32;
export const LINK_URL_MAX = 200;

/** A link on a caller's page: X, Telegram, a site, a trading bot referral... The label may be empty. */
export type ProfileLink = { label: string; url: string };
export type Profile = { bio: string; links: ProfileLink[] };

export const EMPTY_PROFILE: Profile = { bio: "", links: [] };

export type ProfileProblem = "invalid" | "bio_long" | "too_many" | "label_long" | "bad_url";

/** Characters, not UTF-16 units: an emoji counts once, like char_length in SQL. */
export function charCount(s: string): number {
  return Array.from(s).length;
}

// Control characters, and the bidi marks that could make a label read backwards.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/** One line, trimmed, without hidden characters. */
export function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").replace(HIDDEN, "").replace(/ {2,}/g, " ").trim();
}

/**
 * The link as stored, or null if it can't be one: https:// is added when there is no scheme ("x.com/degen"),
 * the host is lowercased and an international one is spelled in punycode, so a look-alike domain shows as
 * xn--.... Only http(s) links to a named host, without a user:password part.
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname.includes(".")) return null;
  // "https://x.com", not "https://x.com/".
  const href = url.pathname === "/" && !url.search && !url.hash ? url.origin : url.href;
  return charCount(href) <= LINK_URL_MAX ? href : null;
}

/** "x.com/degen": the link without the scheme (and a www.), for display. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

/** The host a link really goes to, shown next to its label. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Every link on its own line ("X: https://x.com/degen"), for pasting somewhere else in one go. */
export function linksText(links: ProfileLink[]): string {
  return links.map((l) => (l.label ? `${l.label}: ${l.url}` : l.url)).join("\n");
}

export type ProfileCheck =
  | { ok: true; profile: Profile }
  | { ok: false; error: ProfileProblem; /** The link at fault, by its position in the input. */ index?: number };

/** Cleans a bio and links as sent from the browser, or says what's wrong. Rows left blank are dropped. */
export function checkProfile(input: unknown): ProfileCheck {
  const o = input && typeof input === "object" ? (input as { bio?: unknown; links?: unknown }) : {};
  if ((o.bio !== undefined && typeof o.bio !== "string") || (o.links !== undefined && !Array.isArray(o.links))) {
    return { ok: false, error: "invalid" };
  }
  const bio = cleanText((o.bio as string | undefined) ?? "");
  if (charCount(bio) > BIO_MAX) return { ok: false, error: "bio_long" };

  const links: ProfileLink[] = [];
  for (const [index, row] of ((o.links as unknown[] | undefined) ?? []).entries()) {
    const r = row && typeof row === "object" ? (row as { label?: unknown; url?: unknown }) : null;
    if (!r || (r.label !== undefined && typeof r.label !== "string") || (r.url !== undefined && typeof r.url !== "string")) {
      return { ok: false, error: "invalid", index };
    }
    const label = cleanText((r.label as string | undefined) ?? "");
    const raw = ((r.url as string | undefined) ?? "").trim();
    if (!label && !raw) continue;
    if (charCount(label) > LINK_LABEL_MAX) return { ok: false, error: "label_long", index };
    const url = normalizeUrl(raw);
    if (!url) return { ok: false, error: "bad_url", index };
    links.push({ label, url });
  }
  if (links.length > LINKS_MAX) return { ok: false, error: "too_many" };
  return { ok: true, profile: { bio, links } };
}

export function profileMessage(problem: ProfileProblem): string {
  switch (problem) {
    case "bio_long":
      return `Keep the bio to ${BIO_MAX} characters.`;
    case "too_many":
      return `Up to ${LINKS_MAX} links.`;
    case "label_long":
      return `Keep link names to ${LINK_LABEL_MAX} characters.`;
    case "bad_url":
      return "That doesn't look like a link. Use one like x.com/you or https://t.me/you.";
    default:
      return "Couldn't read that profile.";
  }
}
