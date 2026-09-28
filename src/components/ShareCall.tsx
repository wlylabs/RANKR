"use client";

import clsx from "clsx";
import { Check, Download, Link2, Share, Share2, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { callHref } from "@/lib/format";
import { callCardFile, callShareText } from "@/lib/share";
import { useAuth } from "./AuthProvider";
import { XLogo } from "./Social";

export type ShareableCall = {
  username: string;
  token: { chainId: string; address: string; symbol: string };
  entryMarketCap: number | null;
  multiple: number;
};

const ACTION =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium whitespace-nowrap transition-colors hover:bg-surface-2 disabled:text-subtle disabled:hover:bg-transparent";
const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-fg px-3 text-sm font-medium whitespace-nowrap text-bg transition-opacity hover:opacity-85";

/** The card's image: the PNG the API draws for this call (see api/callers/.../card). */
function cardUrl({ username, token }: ShareableCall) {
  return `/api/callers/${encodeURIComponent(username)}/${token.chainId}/${encodeURIComponent(token.address)}/card`;
}

/**
 * A call's share card: the button, and the dialog it opens with the card as it will look, then the ways out:
 * the phone's share sheet (with the image itself), a post on X, the link, or the image saved. The card is
 * drawn once per opening, so it shows the multiple as it is now; the same image is shown, saved and shared.
 * `variant`: a labeled button (`primary`: the page's main action), an icon (a row of calls) or a full-width row
 * (after posting a call).
 */
export function ShareCall({
  call,
  variant = "button",
  className,
}: {
  call: ShareableCall;
  variant?: "button" | "primary" | "icon" | "row";
  className?: string;
}) {
  const [opened, setOpened] = useState(0);
  const { username } = useAuth();
  const mine = !!username && username.toLowerCase() === call.username.toLowerCase();
  const label = mine ? "Share your call" : "Share this call";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Rows of calls are links: sharing one shouldn't follow it.
          e.preventDefault();
          e.stopPropagation();
          setOpened((n) => n + 1);
        }}
        aria-label={variant === "icon" ? `${label}: $${call.token.symbol}` : undefined}
        title={variant === "icon" ? label : undefined}
        className={clsx(
          variant === "button" &&
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg",
          variant === "primary" &&
            "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-fg px-4 text-sm font-medium text-bg transition-opacity hover:opacity-85",
          variant === "icon" &&
            "grid size-8 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg",
          variant === "row" &&
            "flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg",
          className,
        )}
      >
        <Share2 className="size-3.5 shrink-0" />
        {(variant === "button" || variant === "primary") && "Share"}
        {variant === "row" && <span className="min-w-0 flex-1 truncate">{label}: the card, for X or Telegram</span>}
      </button>
      {/* On the page itself, not inside the row or status card the button sits in. */}
      {opened > 0 && createPortal(<ShareDialog key={opened} call={call} mine={mine} title={label} />, document.body)}
    </>
  );
}

function ShareDialog({ call, mine, title }: { call: ShareableCall; mine: boolean; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [url, setUrl] = useState("");
  const text = callShareText({ ...call, symbol: call.token.symbol, mine });

  // Opens as soon as it mounts (a click on the button), and draws the card for this opening.
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
    setUrl(`${window.location.origin}${callHref(call.username, call.token)}`);
    setCanShare(typeof navigator.share === "function");
    let objectUrl: string | null = null;
    let live = true;
    fetch(`${cardUrl(call)}?at=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
        setFile(new File([blob], callCardFile(call.username, call.token.symbol), { type: "image/png" }));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Drawn once per opening (the dialog is keyed by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function shareNative() {
    const withImage = file && navigator.canShare?.({ files: [file] });
    try {
      // Some share targets drop `url` next to a file, so the link rides in the text.
      await navigator.share(withImage ? { files: [file], text: `${text} ${url}` } : { title, text, url });
    } catch {
      /* canceled */
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  function save() {
    if (!file || !preview) return;
    const a = document.createElement("a");
    a.href = preview;
    a.download = file.name;
    a.click();
  }

  return (
    <dialog
      ref={ref}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      className="sheet m-0 mt-auto w-full max-w-none rounded-t-2xl border border-border bg-bg p-0 text-fg shadow-float sm:m-auto sm:max-w-xl sm:rounded-xl"
      aria-label={title}
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold tracking-tight">{title}</h2>
            <p className="mt-0.5 text-sm text-muted">The card shows the call as it is right now, from the caller&apos;s own entry.</p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="relative aspect-[1200/630] overflow-hidden rounded-lg border border-border bg-surface-2">
          {preview ? (
            <img src={preview} alt={text} className="animate-fade-in size-full object-cover" />
          ) : failed ? (
            <p className="flex size-full items-center justify-center gap-2 px-6 text-center text-sm text-down">
              <TriangleAlert className="size-4 shrink-0" /> Couldn&apos;t draw the card. The link still works.
            </p>
          ) : (
            <div aria-hidden className="skeleton size-full" />
          )}
        </div>

        <p className="mt-3 font-mono text-xs text-pretty text-muted">{text}</p>

        <div className={clsx("mt-4 grid gap-2", canShare ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
          {canShare && (
            <button type="button" onClick={shareNative} className={PRIMARY}>
              <Share className="size-3.5" /> Share
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              window.open(
                `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
            // The phone's share sheet leads where there is one; otherwise X does.
            className={canShare ? ACTION : PRIMARY}
          >
            <XLogo className="size-3.5" /> Post
          </button>
          <button type="button" onClick={copyLink} className={ACTION}>
            {copied ? <Check className="size-3.5 text-up" /> : <Link2 className="size-3.5" />}
            {/* Short on a phone, so every way out fits on one line. */}
            <span className="sm:hidden">{copied ? "Copied" : "Link"}</span>
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
          </button>
          <button type="button" onClick={save} disabled={!file} className={ACTION}>
            <Download className="size-3.5" />
            <span className="sm:hidden">Save</span>
            <span className="hidden sm:inline">Save image</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}
