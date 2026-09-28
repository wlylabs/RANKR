import type { ReactNode } from "react";
import { delay } from "@/lib/motion";

/** The pulsing green dot on everything live: the ticker, the feed, the news, the tracked count. */
export function LiveDot() {
  return (
    <span className="relative flex size-1.5 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-50" />
      <span className="relative inline-flex size-1.5 rounded-full bg-up" />
    </span>
  );
}

/**
 * The top of an app page: the title, marked Live on pages that update by themselves, and a line under it,
 * arriving one after the other.
 */
export function PageHeader({ title, live, children }: { title: ReactNode; live?: boolean; children?: ReactNode }) {
  return (
    <header>
      <h1 className="cine-in flex items-center gap-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
        {title}
        {live && (
          <span className="label inline-flex items-center gap-1.5 font-normal text-subtle">
            <LiveDot />
            Live
          </span>
        )}
      </h1>
      {children && (
        <p className="cine-in mt-2 max-w-2xl text-sm text-pretty text-muted sm:text-[15px]" style={delay(90)}>
          {children}
        </p>
      )}
    </header>
  );
}
