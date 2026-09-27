"use client";

import clsx from "clsx";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { APP_HOME } from "@/lib/login";
import { isStandalone } from "@/lib/pwa";

/** The installed app opens on /app; if it ever lands on the landing page (e.g. added from /), go there. */
export function StandaloneRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (isStandalone()) router.replace(APP_HOME);
  }, [router]);
  return null;
}

/**
 * One FAQ entry that opens and closes smoothly (a native <details> just pops open). The height animates
 * through grid rows, 0fr to 1fr, which works in every browser; closed answers are inert, so screen readers
 * and the tab key skip them. Button + aria-expanded + aria-controls, as in the WAI-ARIA accordion pattern.
 */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-t border-border">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 py-4 text-left font-medium"
        >
          {q}
          <Plus
            className={clsx(
              "size-4 shrink-0 text-subtle transition-transform duration-300 ease-emphasized",
              open && "rotate-45",
            )}
          />
        </button>
      </h3>
      <div
        id={id}
        inert={!open}
        className={clsx(
          "grid ease-emphasized [transition-property:grid-template-rows,opacity]",
          open ? "grid-rows-[1fr] opacity-100 duration-300" : "grid-rows-[0fr] opacity-0 duration-200",
        )}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl pb-5 text-sm text-pretty text-muted">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="border-b border-border">
      {items.map((item) => (
        <FaqItem key={item.q} {...item} />
      ))}
    </div>
  );
}
