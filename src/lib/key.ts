// Sign-in keys: the only way back into an account. No email, no password, just one string like
// rk-7F3A-K9QX-2MPD-W8HT-ZC4N (20 Crockford base32 characters, 100 random bits).
//
// Under the hood a key is an email + password in Supabase Auth: the email is made up from
// sha256 of the key (so the key alone finds the account) and the password is the key itself.
// The server sets both at once, already confirmed, so no email is ever sent. Browser and server.

/** Never receives mail: .invalid is reserved (RFC 2606). Changing it makes every existing key stop working. */
export const KEY_EMAIL_DOMAIN = "key.rankr.invalid";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U
const LENGTH = 20;

function format(body: string): string {
  return `rk-${body.match(/.{4}/g)!.join("-")}`;
}

/** A new random key. */
export function generateKey(random = (n: number) => crypto.getRandomValues(new Uint8Array(n))): string {
  for (;;) {
    // 256 is a multiple of 32, so `& 31` keeps every character equally likely.
    const body = Array.from(random(LENGTH), (b) => ALPHABET[b & 31]).join("");
    // The key is also the password: with a digit and an (upper case) letter next to "rk-", it passes
    // any password rule Supabase can be set to.
    if (/\d/.test(body) && /[A-Z]/.test(body)) return format(body);
  }
}

/**
 * The key in its one canonical spelling, or null if `input` isn't one. Forgiving about case, spaces,
 * dashes, a missing "rk-" and the look-alikes O -> 0, I/L -> 1.
 */
export function parseKey(input: string): string | null {
  let s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.length === LENGTH + 2 && s.startsWith("RK")) s = s.slice(2);
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== LENGTH || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return format(s);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The made-up email a (canonical) key signs in with. */
export async function keyEmail(key: string): Promise<string> {
  return `${(await sha256(`rankr/key/id:${key}`)).slice(0, 32)}@${KEY_EMAIL_DOMAIN}`;
}

export function isKeyEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${KEY_EMAIL_DOMAIN}`);
}

/**
 * A 5x5 mirrored dot pattern from sha256 of the key (like an identicon), so a key can be checked at a
 * glance: the one you saved and the one you paste should look the same. Lit cells as [column, row].
 */
export async function keyArt(key: string): Promise<[number, number][]> {
  const hex = await sha256(`rankr/key/art:${key}`);
  const bits = [...hex.slice(0, 4)].map((h) => parseInt(h, 16).toString(2).padStart(4, "0")).join("");
  const cells: [number, number][] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (bits[r * 3 + Math.min(c, 4 - c)] === "1") cells.push([c, r]);
    }
  }
  return cells;
}
