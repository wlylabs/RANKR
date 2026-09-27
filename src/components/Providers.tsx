"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";

/**
 * Browser and installed-app chrome (Android status bar, desktop app title bar, Safari toolbar) in the theme's
 * color. Rankr picks its theme itself, so the system light / dark setting would pick the wrong one.
 */
function ThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === "light" ? "#ffffff" : "#0a0a0a";
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
  }, [resolvedTheme]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <ThemeColor />
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
