"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR, { mutate as mutateKeys } from "swr";
import { refreshBoards } from "@/lib/hooks";
import { authErrorMessage, loginHref } from "@/lib/login";
import { accountsAvailable, apiFetch, authedFetcher, browserSupabase } from "@/lib/supabase-browser";
import type { MeResponse } from "@/lib/types";

type AuthState = {
  /** Accounts are configured for this deployment. Without them, pasting works without an account. */
  available: boolean;
  /** The stored session (and, when signed in, the profile) has been read. */
  ready: boolean;
  userId: string | null;
  /** Only ever shown to its owner. */
  email: string | null;
  /** Public name on the caller board. New accounts get a default one (e.g. nonce_7f3a). */
  username: string | null;
  /** A one-click guest account: no email, lives in this browser until an email is added. */
  guest: boolean;
  /** Creates a guest account. */
  continueAsGuest: () => Promise<void>;
  /** Emails a sign-in link (and code). New emails get an account. */
  sendLink: (email: string, next?: string) => Promise<void>;
  /** Signs in with the code from the email, for when the link opens in another browser. */
  verifyCode: (email: string, code: string) => Promise<void>;
  /** Guest only: attaches an email (confirmed by link or code), keeping the account and its calls. */
  addEmail: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
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
  email: null,
  username: null,
  guest: false,
  continueAsGuest: unavailable,
  sendLink: unavailable,
  verifyCode: unavailable,
  addEmail: unavailable,
  verifyEmailCode: unavailable,
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
      // e.g. a guest who just confirmed an email: re-read the account.
      void mutateKeys((key) => typeof key === "string" && key.startsWith("/api/me?"));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const meKey = userId ? `/api/me?u=${userId}` : null;
  const me = useSWR<MeResponse>(meKey, authedFetcher, { revalidateOnFocus: false });
  const profileRead = !userId || me.data !== undefined || me.error !== undefined;

  const continueAsGuest = useCallback(async () => {
    const sb = browserSupabase();
    if (!sb) return unavailable();
    const { error } = await sb.auth.signInAnonymously();
    if (error) throw new Error(authErrorMessage(error));
  }, []);

  const addEmail = useCallback(async (email: string) => {
    const sb = browserSupabase();
    if (!sb) return unavailable();
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: `${window.location.origin}/account` });
    if (error) throw new Error(authErrorMessage(error));
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const sb = browserSupabase();
    if (!sb) return unavailable();
    const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email_change" });
    if (error) throw new Error(authErrorMessage(error));
  }, []);

  const sendLink = useCallback(async (email: string, next?: string) => {
    const sb = browserSupabase();
    if (!sb) return unavailable();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${loginHref(next)}` },
    });
    if (error) throw new Error(authErrorMessage(error));
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const sb = browserSupabase();
    if (!sb) return unavailable();
    const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) throw new Error(authErrorMessage(error));
  }, []);

  const { mutate } = me;
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

  const account = me.data?.account;
  const value = useMemo<AuthState>(
    () => ({
      available: accountsAvailable,
      ready: sessionRead && profileRead,
      userId,
      email: account?.email || session?.user.email || null,
      username: account?.id === userId ? (account?.username ?? null) : null,
      guest: !!session?.user.is_anonymous,
      continueAsGuest,
      sendLink,
      verifyCode,
      addEmail,
      verifyEmailCode,
      saveUsername,
      signOut,
    }),
    [
      sessionRead,
      profileRead,
      userId,
      account,
      session,
      continueAsGuest,
      sendLink,
      verifyCode,
      addEmail,
      verifyEmailCode,
      saveUsername,
      signOut,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
