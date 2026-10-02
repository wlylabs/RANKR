import type { ReactNode } from "react";
import { delay } from "@/lib/motion";

/** The pulsing green dot on everything live: the ticker, the tracked count, the landing's top runners. */
export function LiveDot() {
  return (
    <span className="relative flex size-1.5 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-50" />
      <span className="relative inline-flex size-1.5 rounded-full bg-up" />
    </span>
  );
}

/**
 * The top of an app page: the title and a line under it, arriving one after the other, over the page's own
 * backdrop when it has one (Backdrops.tsx).
 */
export function PageHeader({
  title,
  backdrop,
  children,
}: {
  title: ReactNode;
  backdrop?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={backdrop ? "relative isolate" : undefined}>
      {backdrop}
      <h1 className="cine-in text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h1>
      {children && (
        <p className="cine-in mt-2 max-w-2xl text-sm text-pretty text-muted sm:text-[15px]" style={delay(90)}>
          {children}
        </p>
      )}
    </header>
  );
}
