import clsx from "clsx";

/** The check badge of an official account (set by the project owner, see rankr_set_official). */
export function OfficialBadge({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={clsx("inline-block size-3.5 shrink-0 align-[-0.15em] text-fg", className)}
      role="img"
      aria-label="Official account"
    >
      <title>Official Rankr account</title>
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill="currentColor"
      />
      <path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="var(--bg)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
