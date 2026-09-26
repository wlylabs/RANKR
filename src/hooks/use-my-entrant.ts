"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "rankr:entrant-id";

function readStoredEntrantId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useMyEntrant() {
  const [entrantId, setEntrantIdState] = useState<string | null>(readStoredEntrantId);

  const setEntrantId = useCallback((id: string) => {
    setEntrantIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage may be unavailable (private mode) — the session still
      // works, it simply won't remember this entrant on reload.
    }
  }, []);

  return { entrantId, setEntrantId };
}
