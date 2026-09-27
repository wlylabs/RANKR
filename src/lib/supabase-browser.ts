"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Referenced literally so Next.js inlines them at build time.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Accounts are on only when the public Supabase URL and key are configured. */
export const accountsAvailable = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient | null {
  if (!accountsAvailable) return null;
  client ??= createClient(URL!, KEY!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The magic link lands on /login with the session in the URL fragment. Implicit flow (not PKCE)
      // so the link also works when it's opened in a different browser than the one that asked for it.
      detectSessionInUrl: true,
      flowType: "implicit",
    },
  });
  return client;
}

export async function accessToken(): Promise<string | null> {
  const sb = browserSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

/** fetch() that carries the caller's session (if any) to our API. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export async function authedFetcher<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}
