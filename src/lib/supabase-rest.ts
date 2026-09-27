// Server-side access to Supabase: PostgREST (/rest/v1) and Auth (/auth/v1), using the secret key.

export function supabaseConfig(): { url: string; key: string } | null {
  if (process.env.RANKR_MOCK === "1") return null; // demo data never touches a real project
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

export class SupabaseError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export class SupabaseRest {
  constructor(
    private url: string,
    private key: string,
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.url = url.replace(/\/+$/, "");
  }

  private headers(bearer?: string): Record<string, string> {
    const h: Record<string, string> = { apikey: this.key, "content-type": "application/json", accept: "application/json" };
    // New secret keys (sb_secret_...) are not JWTs and must only travel in `apikey`.
    // Legacy service_role keys are JWTs and also go in Authorization.
    if (bearer) h.authorization = `Bearer ${bearer}`;
    else if (this.key.startsWith("eyJ")) h.authorization = `Bearer ${this.key}`;
    return h;
  }

  private async send<T>(path: string, init: RequestInit = {}, bearer?: string): Promise<T> {
    const res = await this.fetchImpl(`${this.url}${path}`, {
      ...init,
      headers: this.headers(bearer),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text;
      try {
        const body = JSON.parse(text) as { message?: string; msg?: string; error_description?: string };
        message = body.message ?? body.msg ?? body.error_description ?? text;
      } catch {
        /* not JSON */
      }
      throw new SupabaseError(`Supabase ${res.status}: ${message}`, res.status);
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  /** GET /rest/v1/<path> */
  select<T>(path: string) {
    return this.send<T>(`/rest/v1/${path}`);
  }

  /** POST /rest/v1/rpc/<fn> */
  rpc<T>(fn: string, args: Record<string, unknown>) {
    return this.send<T>(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  }

  /** PUT /auth/v1/admin/users/<id>: changes a user as an admin (needs the secret key). */
  adminUpdateUser<T>(id: string, attrs: Record<string, unknown>) {
    return this.send<T>(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(attrs) });
  }

  /** The user behind a Supabase Auth access token, or null if the token is not valid. */
  async user<T>(accessToken: string): Promise<T | null> {
    try {
      return await this.send<T>("/auth/v1/user", {}, accessToken);
    } catch (err) {
      if (err instanceof SupabaseError && (err.status === 401 || err.status === 403)) return null;
      throw err;
    }
  }
}
