"use client";

import clsx from "clsx";
import { ArrowUpRight, Check, Copy, Link2, Send } from "lucide-react";
import { callerHref } from "@/lib/format";
import { displayUrl, hostOf, linksText, type ProfileLink } from "@/lib/profile";
import { useCopy } from "./CopyButton";
import { XIcon } from "./XIcon";

const ICON_BUTTON =
  "grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg";

function LinkIcon({ url, className }: { url: string; className?: string }) {
  const host = hostOf(url);
  if (host === "x.com" || host === "twitter.com") return <XIcon className={className} />;
  if (host === "t.me" || host === "telegram.me") return <Send className={className} />;
  return <Link2 className={className} />;
}

/** "Copy" / "Copied" with an icon: the main action on a saved link. */
export function CopyTextButton({
  value,
  what,
  children = "Copy",
  className,
}: {
  value: string | (() => string);
  /** For screen readers: "Copy <what>". */
  what: string;
  children?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(typeof value === "function" ? value() : value)}
      aria-label={copied ? "Copied" : `Copy ${what}`}
      className={clsx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium transition-colors hover:bg-surface-2",
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
      <span aria-hidden>{copied ? "Copied" : children}</span>
    </button>
  );
}

/** The full address of a caller's page, read on click (the origin is only known in the browser). */
export function profileUrl(username: string): string {
  return `${window.location.origin}${callerHref(username)}`;
}

/**
 * A caller's links, each ready to copy or open. The label is theirs, so the host the link really goes to
 * is always shown under it.
 */
export function ProfileLinks({ links }: { links: ProfileLink[] }) {
  if (!links.length) return null;
  return (
    <section className="mt-6" aria-label="Links">
      <div className="flex h-8 items-center justify-between gap-3">
        <h2 className="label text-subtle">Links</h2>
        {links.length > 1 && (
          <CopyTextButton value={linksText(links)} what="all links" className="border-transparent text-muted hover:text-fg">
            Copy all
          </CopyTextButton>
        )}
      </div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {links.map((link, i) => {
          const name = link.label || hostOf(link.url);
          return (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-surface py-2 pr-2 pl-3">
              <LinkIcon url={link.url} className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                {/* Unless the name already is the whole link (no label, nothing past the host). */}
                {displayUrl(link.url) !== name && (
                  <p className="truncate font-mono text-xs text-subtle select-all" title={link.url}>
                    {displayUrl(link.url)}
                  </p>
                )}
              </div>
              <CopyTextButton value={link.url} what={`${name} link`} />
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className={ICON_BUTTON}
                aria-label={`Open ${name} (${hostOf(link.url)})`}
                title={`Open ${hostOf(link.url)}`}
              >
                <ArrowUpRight className="size-3.5" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
