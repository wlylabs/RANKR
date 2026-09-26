"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

interface LogoProps {
  className?: string;
  markClassName?: string;
  size?: number;
  withWordmark?: boolean;
}

/**
 * Original RANKR mark: three ascending bars (a minimal "rising rank" chart)
 * set in a rounded signet, rendered in a champagne-gold gradient.
 */
export function Logo({ className, markClassName, size = 32, withWordmark = true }: LogoProps) {
  const uid = useId();
  const bgId = `rankr-bg-${uid}`;
  const barsId = `rankr-bars-${uid}`;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className={cn("shrink-0", markClassName)}
        role="img"
        aria-label="RANKR"
      >
        <defs>
          <linearGradient id={bgId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#17161a" />
            <stop offset="1" stopColor="#08080a" />
          </linearGradient>
          <linearGradient id={barsId} x1="14" y1="46" x2="50" y2="14" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f8e7bd" />
            <stop offset="1" stopColor="#a87f3c" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill={`url(#${bgId})`} />
        <rect x="1" y="1" width="62" height="62" rx="15" stroke="white" strokeOpacity="0.08" />
        <rect x="15" y="32" width="8" height="18" rx="2.5" fill={`url(#${barsId})`} />
        <rect x="28" y="22" width="8" height="28" rx="2.5" fill={`url(#${barsId})`} />
        <rect x="41" y="12" width="8" height="38" rx="2.5" fill={`url(#${barsId})`} />
      </svg>
      {withWordmark && (
        <span className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
          RANKR
        </span>
      )}
    </div>
  );
}
