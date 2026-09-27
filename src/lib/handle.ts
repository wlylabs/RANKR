/**
 * Public handle of an anonymous caller: "anon-" + the first 6 hex chars of sha256(user id).
 * Same rule as rankr_handle() in SQL. Works in browsers and Node (Web Crypto).
 */
export async function handleOf(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `anon-${hex.slice(0, 6)}`;
}
