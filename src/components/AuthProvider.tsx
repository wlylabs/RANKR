"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { refreshBoards } from "@/lib/hooks";
import { keyEmail, parseKey } from "@/lib/key";
import { captchaToken } from "@/lib/captcha";
import { authErrorMessage } from "@/lib/login";
import { accountsAvailable, apiFetch, authedFetcher, browserSupabase } from "@/lib/supabase-browser";
import type { KeyResponse, MeResponse } from "@/lib/types";

type AuthState = {
  /** Accounts are configured for this deployment. Without them, pasting works without an account. */
  available: boolean;
  /** The stored session (and, when signed in, the profile) has been read. */
  ready: boolean;
  userId: string | null;
  /** Public name on the caller board. New accounts get a default one (e.g. nonce_7f3a). */
  username: string | null;
  /** The account has a sign-in key. Without one it is a guest that lives in this browser only. */
  hasKey: boolean;
  /** An official account: check badge, name locked. */
  official: boolean;
  /** Creates a guest account. */
  continueAsGuest: () => Promise<void>;
  /** Signs in with a key. A guest signed in here is left behind. */
  signInWithKey: (key: string) => Promise<void>;
  /** Gives the account a new key and returns it, once. An older key stops working; other devices are signed out. */
  makeKey: () => Promise<string>;
  saveUsername: (username: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const unavailable = async () => {
  throw new Error("Accounts are not set up on this deployment.");
};

const AuthContext = createContext<AuthState>({
  available: false,
  ready: true,
  userId: null,
  username: null,
  hasKey: false,
  official: false,
  continueAsGuest: unavailable,
  signInWithKey: unavailable,
  makeKey: unavailable,
  saveUsername: unavailable,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionRead, setSessionRead] = useState(!accountsAvailable);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionRead(true);
    });
    const { data } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void refreshBoards();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const meKey = userId ? `/api/me?u=${userId}` : null;
  const me = useSWR<MeResponse>(meKey, authedFetcher, { revalidateOnFocus: false });
  const profileRead = !userId || me.data !== undefined || me.error !== undefined;

  const continueAsGuest = useCallback(async () => {
    const sb = browserSupabase();
    if (!sb) return unavailable();
    // With Turnstile set up (NEXT_PUBLIC_TURNSTILE_SITE_KEY + CAPTCHA on in Supabase), a fresh token each time.
    const captcha = await captchaToken();
    const { error } = await sb.auth.signInAnonymously(captcha ? { options: { captchaToken: captcha } } : undefined);
    if (error) throw new Error(authErrorMessage(error));
  }, []);

  const signInWithKey = useCallback(async (input: string) => {
    const sb = browserSupabase();
    if (!sb) return unavailable();
    const key = parseKey(input);
    if (!key) throw new Error("That isn't a Rankr key. It looks like rk- and 20 letters and numbers.");
    const captcha = await captchaToken();
    const { error } = await sb.auth.signInWithPassword({
      email: await keyEmail(key),
      password: key,
      ...(captcha ? { options: { captchaToken: captcha } } : {}),
    });
    if (error) throw new Error(authErrorMessage(error));
  }, []);

  const { mutate } = me;
  const makeKey = useCallback(async () => {
    const res = await apiFetch("/api/me/key", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? "Could not make your key. Try again.");
    const { key, account } = body as KeyResponse;
    await mutate({ account }, { revalidate: false });
    // Whoever had the old key is signed out everywhere but here.
    await browserSupabase()
      ?.auth.signOut({ scope: "others" })
      .catch(() => {});
    return key;
  }, [mutate]);

  const saveUsername = useCallback(
    async (username: string) => {
      const res = await apiFetch("/api/me/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not save your username.");
      await mutate(body as MeResponse, { revalidate: false });
      void refreshBoards();
    },
    [mutate],
  );

  const signOut = useCallback(async () => {
    await browserSupabase()?.auth.signOut({ scope: "local" });
  }, []);

  const account = me.data?.account?.id === userId ? me.data?.account : undefined;
  const value = useMemo<AuthState>(
    () => ({
      available: accountsAvailable,
      ready: sessionRead && profileRead,
      userId,
      username: account?.username ?? null,
      hasKey: !!account?.hasKey,
      official: !!account?.official,
      continueAsGuest,
      signInWithKey,
      makeKey,
      saveUsername,
      signOut,
    }),
    [sessionRead, profileRead, userId, account, continueAsGuest, signInWithKey, makeKey, saveUsername, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
