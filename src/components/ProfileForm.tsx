"use client";

import clsx from "clsx";
import { ArrowUpRight, LoaderCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { callerHref } from "@/lib/format";
import { refreshBoards, useMyProfile } from "@/lib/hooks";
import {
  BIO_MAX,
  LINKS_MAX,
  charCount,
  checkProfile,
  profileMessage,
  type Profile,
} from "@/lib/profile";
import { apiFetch } from "@/lib/supabase-browser";
import type { ProfileResponse } from "@/lib/types";
import { CopyTextButton, profileUrl } from "./ProfileLinks";

const INPUT =
  "h-10 w-full min-w-0 rounded-lg border bg-surface px-3 text-sm outline-none transition-colors placeholder:text-subtle/60 focus:border-border-strong";

type Row = { id: number; label: string; url: string };

let nextId = 0;
const toRows = (p: Profile): Row[] => p.links.map((l) => ({ id: nextId++, label: l.label, url: l.url }));

/** What's wrong with one link row (null when fine or left blank). */
function rowProblem(row: Row): string | null {
  const out = checkProfile({ links: [{ label: row.label, url: row.url }] });
  return out.ok ? null : profileMessage(out.error);
}

/** Bio and links shown on your public page, each link ready to copy there. */
export function ProfileSection({ userId, username }: { userId: string; username: string }) {
  const { data, error, mutate } = useMyProfile(userId);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // "Edit profile" on your page links to /account#profile; the section only exists once the account is read.
  useEffect(() => {
    if (window.location.hash === "#profile") ref.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <section id="profile" ref={ref} className="mt-6 scroll-mt-20 rounded-lg border border-border p-5">
      <h2 className="text-sm font-medium">Profile</h2>
      <p className="mt-1 text-sm text-muted">
        A short bio and your links (X, Telegram, a site, a referral link...), shown on your public page with a copy
        button each.
      </p>
      {data ? (
        <Editor
          // A fresh editor for what was just saved (or loaded).
          key={JSON.stringify(data.profile)}
          saved={data.profile}
          onSaved={async (profile) => {
            await mutate({ profile }, { revalidate: false });
            setSaved(true);
            void refreshBoards();
          }}
          onEdit={() => setSaved(false)}
        />
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-down">
          {(error as Error).message}
        </p>
      ) : (
        <LoaderCircle className="mt-5 size-5 animate-spin text-subtle" />
      )}
      {saved && <p className="mt-3 text-xs text-up">Saved.</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <span className="mr-auto min-w-0 truncate font-mono text-xs text-muted">{callerHref(username)}</span>
        <CopyTextButton value={() => profileUrl(username)} what="your profile link">
          Copy link
        </CopyTextButton>
        <Link
          href={callerHref(username)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium transition-colors hover:bg-surface-2"
        >
          View <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}

function Editor({
  saved,
  onSaved,
  onEdit,
}: {
  saved: Profile;
  onSaved: (profile: Profile) => Promise<void>;
  onEdit: () => void;
}) {
  const [bio, setBio] = useState(saved.bio);
  const [rows, setRows] = useState<Row[]>(() => toRows(saved));
  // Rows whose problems show: left once (blurred), or all of them after a save was tried.
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusId = useRef<number | null>(null);

  const check = checkProfile({ bio, links: rows.map(({ label, url }) => ({ label, url })) });
  // Both sides cleaned the same way, so key order and spacing don't count as a change.
  const changed = !check.ok || JSON.stringify(check) !== JSON.stringify(checkProfile(saved));
  const bioCount = charCount(bio.trim());

  function edit(next: () => void) {
    next();
    setError(null);
    onEdit();
  }

  function update(id: number, patch: Partial<Row>) {
    edit(() => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))));
  }

  function add() {
    const id = nextId++;
    focusId.current = id;
    edit(() => setRows((rs) => [...rs, { id, label: "", url: "" }]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!check.ok || !changed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/me/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(check.profile),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not save your profile.");
      await onSaved((body as ProfileResponse).profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5" noValidate>
      <div className="flex items-baseline justify-between">
        <label htmlFor="bio" className="label text-subtle">
          Bio
        </label>
        <span className={clsx("font-mono text-[11px]", bioCount > BIO_MAX ? "text-down" : "text-subtle")}>
          {bioCount}/{BIO_MAX}
        </span>
      </div>
      <textarea
        id="bio"
        value={bio}
        onChange={(e) => edit(() => setBio(e.target.value))}
        // One line on the page: Enter doesn't add one.
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        rows={2}
        placeholder="Low caps on Solana. Calls here first."
        aria-invalid={bioCount > BIO_MAX}
        className={clsx(
          INPUT,
          "mt-2 h-auto resize-none py-2 leading-snug",
          bioCount > BIO_MAX ? "border-down/60" : "border-border",
        )}
      />

      <div className="mt-5 flex items-baseline justify-between">
        <span className="label text-subtle">Links</span>
        <span className="font-mono text-[11px] text-subtle">
          {rows.length}/{LINKS_MAX}
        </span>
      </div>
      {rows.length ? (
        <ul className="mt-2 space-y-3">
          {rows.map((row, i) => {
            const problem = touched.has(row.id) || tried ? rowProblem(row) : null;
            return (
              <li key={row.id}>
                <div className="flex items-start gap-2">
                  <div
                    className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[9rem_1fr]"
                    onBlur={(e) => {
                      // Only once focus leaves the row, not when moving from its name to its link.
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setTouched((t) => new Set(t).add(row.id));
                      }
                    }}
                  >
                    <input
                      value={row.label}
                      onChange={(e) => update(row.id, { label: e.target.value })}
                      aria-label={`Link ${i + 1} name`}
                      placeholder="Name (optional)"
                      autoComplete="off"
                      className={clsx(INPUT, "border-border")}
                    />
                    <input
                      ref={(el) => {
                        if (el && focusId.current === row.id) {
                          focusId.current = null;
                          el.focus();
                        }
                      }}
                      value={row.url}
                      onChange={(e) => update(row.id, { url: e.target.value })}
                      aria-label={`Link ${i + 1}`}
                      aria-invalid={!!problem}
                      inputMode="url"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder="x.com/you"
                      className={clsx(INPUT, "font-mono", problem ? "border-down/60" : "border-border")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => edit(() => setRows((rs) => rs.filter((r) => r.id !== row.id)))}
                    aria-label={`Remove link ${i + 1}`}
                    className="grid size-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {problem && <p className="mt-1.5 text-xs text-down">{problem}</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-subtle">No links yet.</p>
      )}
      <button
        type="button"
        onClick={add}
        disabled={rows.length >= LINKS_MAX}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
      >
        <Plus className="size-3.5" /> Add link
      </button>

      {(error || (tried && !check.ok && check.error === "bio_long")) && (
        <p role="alert" className="mt-4 text-sm text-down">
          {error ?? (check.ok ? null : profileMessage(check.error))}
        </p>
      )}
      <button
        type="submit"
        disabled={!changed || busy}
        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-fg text-sm font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {busy && <LoaderCircle className="size-4 animate-spin" />}
        Save profile
      </button>
    </form>
  );
}
