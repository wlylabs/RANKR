import { afterEach, describe, expect, it, vi } from "vitest";
import { embedText, PostError, readPost } from "./x-post";

const EMBED = {
  url: "https://twitter.com/Degen_Caller/status/1840000000000000001",
  author_name: "Degen",
  author_url: "https://twitter.com/Degen_Caller",
  html:
    '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Verifying my Rankr caller profile: <a href="https://t.co/abc">rankr.example/u/nonce_7f3a</a><br><br>rankr-0123456789 &amp; gm</p>&mdash; Degen (@Degen_Caller) <a href="https://twitter.com/Degen_Caller/status/1840000000000000001">September 27, 2026</a></blockquote>\n',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("readPost", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the author and text through X's embed endpoint, looking the post up by id", async () => {
    const fetchMock = vi.fn(async () => json(EMBED));
    expect(await readPost("1840000000000000001", fetchMock as typeof fetch)).toEqual({
      author: "Degen_Caller",
      text: "Verifying my Rankr caller profile: rankr.example/u/nonce_7f3a\n\nrankr-0123456789 & gm",
    });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.origin).toBe("https://publish.twitter.com");
    expect(url.searchParams.get("url")).toBe("https://twitter.com/i/status/1840000000000000001");
  });

  it("says there is no post when it is deleted or protected, and throws when X can't be reached", async () => {
    expect(await readPost("1", (async () => new Response("", { status: 404 })) as typeof fetch)).toBeNull();
    expect(await readPost("1", (async () => new Response("", { status: 403 })) as typeof fetch)).toBeNull();
    await expect(readPost("1", (async () => new Response("", { status: 503 })) as typeof fetch)).rejects.toBeInstanceOf(PostError);
    await expect(readPost("1", (async () => { throw new TypeError("fetch failed"); }) as typeof fetch)).rejects.toBeInstanceOf(PostError);
  });

  it("uses the X API with X_BEARER_TOKEN", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "token");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ data: { id: "1", text: "gm rankr-0123456789", author_id: "42" }, includes: { users: [{ id: "42", username: "Degen_Caller" }] } }),
    );
    expect(await readPost("1", fetchMock as unknown as typeof fetch)).toEqual({ author: "Degen_Caller", text: "gm rankr-0123456789" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.x.com/2/tweets/1?expansions=author_id&user.fields=username");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token");
    // Not visible: 200 with errors and no data.
    expect(await readPost("1", (async () => json({ errors: [{ title: "Not Found Error" }] })) as typeof fetch)).toBeNull();
  });
});

describe("embedText", () => {
  it("keeps only the post's own text", () => {
    expect(embedText(EMBED.html)).not.toContain("Degen (@Degen_Caller)");
    expect(embedText("<p>a &lt;b&gt; &#39;c&#39; &#8212;</p>")).toBe("a <b> 'c' —");
  });
});
