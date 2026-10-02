"use client";

import clsx from "clsx";
import { Check, Download, Link2, Share, Share2, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shortAddress } from "@/lib/format";
import { caseFile } from "@/lib/trace/case";
import { traceHref, type TraceChain } from "@/lib/trace/chains";
import { trailPath } from "@/lib/trace/path";
import { traceImageFile, traceShareText } from "@/lib/trace/share";
import type { Layout } from "@/lib/trace/tree";
import type { TraceResponse } from "@/lib/trace/types";
import { ACTION, PRIMARY } from "../ShareCall";
import { XLogo } from "../Social";
import { drawPathImage, drawTraceImage } from "./traceImage";

/** Tall: the trail as one line, for phones (the default). Wide: the whole tree as it's opened. */
type Format = "tall" | "wide";
const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "tall", label: "Tall", hint: "The trail as one line, 4:5: reads best on a phone" },
  { id: "wide", label: "Wide", hint: "The whole tree as it's opened, 16:9" },
];

type ShareTraceProps = {
  chain: TraceChain;
  root: TraceResponse;
  data: Map<string, TraceResponse>;
  layout: Layout;
  caseId: string;
  /** A labeled button (the page header), or an icon (fullscreen's top bar). */
  variant?: "button" | "icon";
};

/**
 * The trail as a picture to post: the button, and the dialog it opens with the image as it will look (the tree
 * as it's opened right now), then the ways out: the phone's share sheet with the image itself (X's app takes it
 * from there), a post on X, the link, or the image saved.
 */
export function ShareTrace({ variant = "button", ...props }: ShareTraceProps) {
  const [opened, setOpened] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpened((n) => n + 1)}
        aria-label={variant === "icon" ? "Share the trail as an image" : undefined}
        title={variant === "icon" ? "Share the trail as an image" : undefined}
        className={clsx(
          variant === "button" &&
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg",
          variant === "icon" &&
            "grid size-9 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg",
        )}
      >
        <Share2 className="size-3.5" />
        {variant === "button" && "Share image"}
      </button>
      {/* Its own top layer (a native dialog), over fullscreen too. */}
      {opened > 0 && createPortal(<ShareTraceDialog key={opened} {...props} />, document.body)}
    </>
  );
}

function ShareTraceDialog({ chain, root, data, layout, caseId }: ShareTraceProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [url, setUrl] = useState("");
  const name = root.label?.name ?? shortAddress(root.address);
  const { flags, exits } = caseFile(root, data);
  const text = traceShareText(name, exits);

  const [format, setFormat] = useState<Format>("tall");

  // Opens as soon as it mounts (a click on the button).
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
    setUrl(`${window.location.origin}${traceHref(chain.id, root.address)}`);
    setCanShare(typeof navigator.share === "function");
  }, [chain.id, root.address]);

  // Draws the trail as it's opened now, in the format picked (again when another is picked).
  useEffect(() => {
    let objectUrl: string | null = null;
    let live = true;
    setPreview(null);
    setFile(null);
    setFailed(false);
    const common = {
      root,
      caseId,
      chainName: chain.id === "solana" ? "Solana" : chain.id,
      flags,
      exits,
      where: `${window.location.host}/trace/${chain.id}/${shortAddress(root.address)}`,
    };
    const rootItem = layout.nodes.find((n) => n.item.id === "root")!.item;
    (format === "tall"
      ? drawPathImage({ ...common, steps: trailPath(rootItem) })
      : drawTraceImage({ ...common, layout })
    )
      .then((blob) => {
        if (!blob) throw new Error("no canvas");
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
        setFile(new File([blob], traceImageFile(root.address, format === "wide"), { type: "image/png" }));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // The trail is the one the dialog opened on; only the format changes while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  async function shareNative() {
    const withImage = file && navigator.canShare?.({ files: [file] });
    try {
      // Some share targets drop `url` next to a file, so the link rides in the text.
      await navigator.share(withImage ? { files: [file], text: `${text} ${url}` } : { text, url });
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
      className="sheet m-0 mt-auto w-full max-w-none rounded-t-2xl border border-border bg-bg p-0 text-fg shadow-float sm:m-auto sm:max-w-2xl sm:rounded-xl"
      aria-label="Share the trail"
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold tracking-tight">Share the trail</h2>
            <p className="mt-0.5 text-sm text-muted">
              The trail as it&apos;s opened right now. Open the wallets it went through first.
            </p>
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

        <div role="radiogroup" aria-label="Format" className="mb-3 inline-flex rounded-lg border border-border p-0.5">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={format === f.id}
              title={f.hint}
              onClick={() => setFormat(f.id)}
              className={clsx(
                "rounded-md px-3 py-1 text-sm transition-colors",
                format === f.id ? "bg-fg font-medium text-bg" : "text-muted hover:text-fg",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div
          className={clsx(
            "relative mx-auto overflow-hidden rounded-lg border border-border bg-surface-2",
            // Tall, kept short enough that the buttons stay on screen.
            format === "tall" ? "aspect-[4/5] w-full max-w-[min(100%,46svh)]" : "aspect-video w-full",
          )}
        >
          {preview ? (
            <img src={preview} alt={text} className="animate-fade-in size-full object-cover" />
          ) : failed ? (
            <p className="flex size-full items-center justify-center gap-2 px-6 text-center text-sm text-down">
              <TriangleAlert className="size-4 shrink-0" /> Couldn&apos;t draw the image. The link still works.
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
            <span className="sm:hidden">{copied ? "Copied" : "Link"}</span>
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
          </button>
          <button type="button" onClick={save} disabled={!file} className={ACTION}>
            <Download className="size-3.5" />
            <span className="sm:hidden">Save</span>
            <span className="hidden sm:inline">Save image</span>
          </button>
        </div>
        {!canShare && (
          <p className="mt-3 text-xs text-subtle">
            On X, attach the saved image to the post: X doesn&apos;t take an image from a link.
          </p>
        )}
      </div>
    </dialog>
  );
}
