"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Referenced literally so Next.js inlines them at build time.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Anonymous accounts are on only when the public Supabase URL and key are configured. */
export const accountsAvailable = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient | null {
  if (!accountsAvailable) return null;
  client ??= createClient(URL!, KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export async function accessToken(): Promise<string | null> {
  const sb = browserSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

let starting: Promise<string | null> | null = null;

/**
 * The caller's access token, creating an anonymous account on first use. Called on paste, so
 * people who only browse never get an account. Null if accounts are off or sign-in failed.
 */
export function ensureSession(): Promise<string | null> {
  starting ??= (async () => {
    const sb = browserSupabase();
    if (!sb) return null;
    const existing = await accessToken();
    if (existing) return existing;
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      console.warn("[rankr] anonymous sign-in failed, pasting without an id:", error.message);
      return null;
    }
    return data.session?.access_token ?? null;
  })().finally(() => {
    starting = null;
  });
  return starting;
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
