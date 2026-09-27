import clsx from "clsx";
import { Check, Send } from "lucide-react";
import type { CallerAbout } from "@/lib/types";

/** The X logo, in the text color. */
export function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={clsx("inline-block size-3.5 shrink-0", className)} aria-hidden="true">
      <path
        d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
        fill="currentColor"
      />
    </svg>
  );
}

const LINK = "inline-flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-fg";

/** A caller's X account (verified ones only, see src/lib/profile.ts) and Telegram, as links. */
export function SocialLinks({ about, className }: { about: CallerAbout; className?: string }) {
  const x = about.xVerified ? about.x : null;
  if (!x && !about.telegram) return null;
  return (
    <div className={clsx("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {x && (
        <a
          href={`https://x.com/${x}`}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          title="Verified on X"
          className={LINK}
        >
          <XLogo />
          <span className="truncate">@{x}</span>
          <Check className="size-3 shrink-0 text-fg" aria-hidden />
          <span className="sr-only">(verified on X)</span>
        </a>
      )}
      {about.telegram && (
        <a href={`https://t.me/${about.telegram}`} target="_blank" rel="noopener noreferrer nofollow ugc" className={LINK}>
          <Send className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">@{about.telegram}</span>
          <span className="sr-only">(Telegram)</span>
        </a>
      )}
    </div>
  );
}
