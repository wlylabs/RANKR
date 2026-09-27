"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { handleOf } from "@/lib/handle";
import { refreshBoards } from "@/lib/hooks";
import { accountsAvailable, browserSupabase } from "@/lib/supabase-browser";

type AuthState = {
  /** Anonymous accounts are configured for this deployment. */
  available: boolean;
  /** The stored session has been read. */
  ready: boolean;
  userId: string | null;
  /** Public handle, e.g. "anon-a3f9c1". */
  handle: string | null;
  /** Drops this browser's anonymous id; the next paste starts a new one. */
  resetIdentity: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  available: false,
  ready: true,
  userId: null,
  handle: null,
  resetIdentity: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!accountsAvailable);
  const [handle, setHandle] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void refreshBoards();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let live = true;
    if (userId) handleOf(userId).then((h) => live && setHandle(h));
    else setHandle(null);
    return () => {
      live = false;
    };
  }, [userId]);

  const resetIdentity = useCallback(async () => {
    await browserSupabase()?.auth.signOut({ scope: "local" });
  }, []);

  const value = useMemo<AuthState>(
    () => ({ available: accountsAvailable, ready, userId, handle, resetIdentity }),
    [ready, userId, handle, resetIdentity],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
