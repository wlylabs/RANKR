"use client";

import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type Box = { x: number; w: number };

/**
 * Where the selected option sits in `container` (its child marked `data-active`): the left edge and width a
 * sliding indicator needs. Measured again when the selection changes and whenever something resizes (the
 * fonts arriving, the window). `animate` turns on after the first placement, so the indicator shows up in
 * place and only glides from one option to another. With nothing selected (the header nav on a token page)
 * it fades out where it was, and comes back gliding from there.
 */
export function useIndicator(container: RefObject<HTMLElement | null>, selected: unknown) {
  const [box, setBox] = useState<Box | null>(null);
  const [shown, setShown] = useState(false);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>(":scope > [data-active]");
      setShown(!!on);
      if (on) setBox((b) => (b && b.x === on.offsetLeft && b.w === on.offsetWidth ? b : { x: on.offsetLeft, w: on.offsetWidth }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  }, [container, selected]);

  useEffect(() => {
    if (!box || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [box, animate]);

  return { box, shown, animate };
}

/** The mark that slides to the selected option (an underline, a pill), placed by useIndicator. */
export function Indicator({ box, shown, animate, className }: ReturnType<typeof useIndicator> & { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "pointer-events-none absolute left-0",
        animate && "transition-[transform,width,opacity] duration-300 ease-emphasized",
        !shown && "opacity-0",
        className,
      )}
      style={box ? { transform: `translateX(${box.x}px)`, width: box.w } : undefined}
    />
  );
}

function Tab({ active, onClick, underline, children }: { active: boolean; onClick: () => void; underline: boolean; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  // On a phone the row scrolls: keep the selected tab in view (e.g. opened on "Most pasted").
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      onClick={onClick}
      aria-selected={active}
      data-active={active || undefined}
      className={clsx(
        "relative h-10 shrink-0 rounded-sm text-sm whitespace-nowrap transition-colors",
        active ? "text-fg" : "text-muted hover:text-fg",
        // Its own underline until the sliding one is placed (first paint, no JavaScript).
        active && underline && "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-fg",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A row of tabs over a hairline, the underline gliding to the picked one. On a phone the row scrolls sideways
 * and fades at its edge; from sm up it fits, and stops clipping so a keyboard focus ring shows whole.
 */
export function TabBar<K extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: Record<K, ReactNode>;
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const indicator = useIndicator(ref, value);
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      className={clsx(
        "scrollbar-none fade-end relative -mx-4 flex gap-6 overflow-x-auto border-b border-border pr-10 pl-4 sm:mx-0 sm:overflow-visible sm:px-0",
        className,
      )}
    >
      {(Object.keys(options) as K[]).map((key) => (
        <Tab key={key} active={value === key} onClick={() => onChange(key)} underline={!indicator.shown}>
          {options[key]}
        </Tab>
      ))}
      <Indicator {...indicator} className="bottom-0 h-px bg-fg" />
    </div>
  );
}

/**
 * Options in a hairline frame, a pill gliding behind the picked one. `pressed`: a group of toggle buttons (a
 * filter) rather than tabs (a view).
 */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
  pressed = false,
  className,
  optionClassName = "px-3 text-xs",
}: {
  label: string;
  options: Record<K, ReactNode>;
  value: K;
  onChange: (key: K) => void;
  pressed?: boolean;
  className?: string;
  optionClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const indicator = useIndicator(ref, value);
  return (
    <div
      ref={ref}
      role={pressed ? "group" : "tablist"}
      aria-label={label}
      className={clsx("relative flex h-8 items-center rounded-md border border-border p-0.5", className)}
    >
      <Indicator {...indicator} className="inset-y-0.5 rounded bg-surface-2" />
      {(Object.keys(options) as K[]).map((key) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            role={pressed ? undefined : "tab"}
            aria-selected={pressed ? undefined : on}
            aria-pressed={pressed ? on : undefined}
            data-active={on || undefined}
            onClick={() => onChange(key)}
            className={clsx(
              "relative h-full rounded whitespace-nowrap transition-colors duration-300",
              on ? "text-fg" : "text-subtle hover:text-fg",
              // Its own fill until the sliding pill is placed.
              on && !indicator.shown && "bg-surface-2",
              optionClassName,
            )}
          >
            {options[key]}
          </button>
        );
      })}
    </div>
  );
}
