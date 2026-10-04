"use client";

import clsx from "clsx";
import { useEffect, useRef, type ReactNode } from "react";

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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
      className={clsx(
        "relative h-10 shrink-0 rounded-sm text-sm whitespace-nowrap",
        active
          ? "text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-fg"
          : "text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A row of tabs over a hairline, the picked one underlined. Nothing moves, like any other app's tabs: the line
 * is just under the tab you picked. On a phone the row scrolls sideways and fades at its edge; from sm up it
 * fits, and stops clipping so a keyboard focus ring shows whole.
 */
export function TabBar<K extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  /** In order; a key left out isn't shown. */
  options: Partial<Record<K, ReactNode>>;
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={clsx(
        "scrollbar-none fade-end relative -mx-4 flex gap-6 overflow-x-auto border-b border-border pr-10 pl-4 sm:mx-0 sm:overflow-visible sm:px-0",
        className,
      )}
    >
      {(Object.keys(options) as K[]).map((key) => (
        <Tab key={key} active={value === key} onClick={() => onChange(key)}>
          {options[key]}
        </Tab>
      ))}
    </div>
  );
}

/**
 * Options in a hairline frame, the picked one filled. Nothing moves. `pressed`: a group of toggle buttons (a
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
  return (
    <div
      role={pressed ? "group" : "tablist"}
      aria-label={label}
      className={clsx("flex h-8 items-center rounded-md border border-border p-0.5", className)}
    >
      {(Object.keys(options) as K[]).map((key) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            role={pressed ? undefined : "tab"}
            aria-selected={pressed ? undefined : on}
            aria-pressed={pressed ? on : undefined}
            onClick={() => onChange(key)}
            className={clsx(
              "h-full rounded whitespace-nowrap",
              on ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg",
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
