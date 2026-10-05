// Encrypts small secrets (accounts' own API keys) before they're stored: AES-256-GCM, its key derived from
// TRACE_KEYS_SECRET, or from the Supabase secret key when that isn't set. Server only. Changing the secret makes
// what was stored unreadable: open() says null, and the account adds its keys again.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function key(): Buffer | null {
  const secret =
    process.env.TRACE_KEYS_SECRET?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return secret ? createHash("sha256").update(`rankr:trace-keys:${secret}`).digest() : null;
}

/** Whether there's a secret to encrypt with. */
export const canSeal = () => key() !== null;

/** "v1:<iv.tag.ciphertext, base64url>". Throws without a secret. */
export function seal(plain: string): string {
  const k = key();
  if (!k) throw new Error("No secret to encrypt with (TRACE_KEYS_SECRET).");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

/** The secret sealed in `box`, or null when it can't be read (another secret, or not one of ours). */
export function open(box: string | null | undefined): string | null {
  const k = key();
  if (!k || !box?.startsWith(`${VERSION}:`)) return null;
  try {
    const raw = Buffer.from(box.slice(VERSION.length + 1), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
