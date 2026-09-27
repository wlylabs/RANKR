// Reads a public post on X, to verify a caller's X account (see verifyX in accounts.ts). Server only.
//
// With X_BEARER_TOKEN set (an X API app's bearer token), through the X API. Without it, through X's
// public embed endpoint (publish.twitter.com/oembed), which needs no key: it gives the author and the
// post's text as embed HTML.

/** A post: its author's X username and its text. */
export type Post = { author: string; text: string };

export class PostError extends Error {}

const UNREACHABLE = "Couldn't reach X right now. Try again in a minute.";

function authorOf(url: string | undefined): string | null {
  return url?.match(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?$/i)?.[1] ?? null;
}

/** The text of the post in oEmbed HTML: the <p> of the blockquote, tags stripped, entities decoded. */
export function embedText(html: string): string {
  const p = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  return p
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function viaEmbed(id: string, fetchImpl: typeof fetch): Promise<Post | null> {
  // The author in the link doesn't matter: X looks the post up by id and names its real author.
  const url = `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(`https://twitter.com/i/status/${id}`)}`;
  const res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  // Deleted, protected or suspended.
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new PostError(UNREACHABLE);
  const body = (await res.json()) as { author_url?: string; html?: string };
  const author = authorOf(body.author_url);
  return author && body.html ? { author, text: embedText(body.html) } : null;
}

async function viaApi(id: string, token: string, fetchImpl: typeof fetch): Promise<Post | null> {
  const res = await fetchImpl(`https://api.x.com/2/tweets/${id}?expansions=author_id&user.fields=username`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`[rankr] X API ${res.status}`, await res.text().catch(() => ""));
    throw new PostError(UNREACHABLE);
  }
  const body = (await res.json()) as {
    data?: { text?: string; author_id?: string };
    includes?: { users?: { id: string; username: string }[] };
  };
  // Not found or not visible comes back as 200 with `errors` and no `data`.
  const author = body.includes?.users?.find((u) => u.id === body.data?.author_id)?.username;
  return author && typeof body.data?.text === "string" ? { author, text: body.data.text } : null;
}

/** The post with this id, or null when there is no public post with it. Throws PostError when X can't be reached. */
export async function readPost(id: string, fetchImpl: typeof fetch = fetch): Promise<Post | null> {
  const token = process.env.X_BEARER_TOKEN;
  try {
    return token ? await viaApi(id, token, fetchImpl) : await viaEmbed(id, fetchImpl);
  } catch (err) {
    if (err instanceof PostError) throw err;
    console.error("[rankr] reading a post on X failed", err);
    throw new PostError(UNREACHABLE);
  }
}
