"use client";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export function Navbar({ onClaim }: { onClaim: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12px] font-medium text-foreground-subtle sm:inline-flex">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
            </span>
            Live
          </span>
          <Button size="sm" onClick={onClaim}>
            Claim Your Rank
          </Button>
        </div>
      </div>
    </header>
  );
}
