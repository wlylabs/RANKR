import clsx from "clsx";
import { useId } from "react";

/** The Rankr mark: a lowercase "r" whose arm breaks out into an up-and-right arrow. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#E4FF3F" />
          <stop offset="1" stopColor="#19D98C" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${id})`} />
      <g fill="none" stroke="#06130B" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 48V25" />
        <path d="M19 36c0-8 5-12 12-12 3 0 5-1 7-3l7-7" />
        <path d="M36 14h9v9" />
      </g>
    </svg>
  );
}

export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="text-[1.35rem] font-extrabold leading-none tracking-[-0.05em]">rankr</span>
    </span>
  );
}
