"use client";

import clsx from "clsx";
import { Check, Copy, Globe, LoaderCircle, Send } from "lucide-react";
import { useState } from "react";
import { callerHref } from "@/lib/format";
import {
  BIO_MAX,
  checkProfile,
  cleanBio,
  parseTelegram,
  parseWebsite,
  parseX,
  TELEGRAM_HELP,
  WEBSITE_HELP,
  WEBSITE_MAX,
  X_HELP,
  xCode,
  xPostText,
  type ProfileInput,
  type ProfileProblem,
} from "@/lib/profile";
import type { CallerAbout } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { XLogo } from "./Social";

const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-fg px-4 text-sm font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50";
const SECONDARY =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3.5 text-sm transition-colors hover:bg-surface-2 disabled:opacity-50";
const FIELD =
  "rounded-lg border border-border bg-surface px-3 transition-colors focus-within:border-border-strong has-[[aria-invalid=true]]:border-down/60";

function Hint({ id, error, children }: { id: string; error?: string | null; children: React.ReactNode }) {
  return (
    <p id={id} className={clsx("mt-1.5 text-xs", error ? "text-down" : "text-subtle")}>
      {error ?? children}
    </p>
  );
}

/** One link input: an "@name" for X or Telegram (`handle`), or a website. */
function LinkField({
  id,
  label,
  icon,
  value,
  onChange,
  placeholder,
  help,
  error,
  handle = false,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  help: string;
  error: string | null;
  handle?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="label flex items-center gap-1.5 text-subtle">
        {icon} {label}
      </label>
      <div className={clsx(FIELD, "mt-2 flex h-11 items-center")}>
        {handle && <span className="font-mono text-subtle">@</span>}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          inputMode={handle ? "text" : "url"}
          maxLength={handle ? 64 : WEBSITE_MAX + 20}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent pl-0.5 font-mono outline-none placeholder:text-subtle/60"
        />
      </div>
      <Hint id={`${id}-hint`} error={error}>
        {help}
      </Hint>
    </div>
  );
}

/** Bio, X, Telegram and website. The X account shows on the profile once verified (XVerify). */
export function ProfileSection({ about }: { about: CallerAbout }) {
  const { saveProfile } = useAuth();
  const [form, setForm] = useState<ProfileInput>({
    bio: about.bio ?? "",
    x: about.x ?? "",
    telegram: about.telegram ?? "",
    website: about.website ?? "",
  });
  const [problem, setProblem] = useState<ProfileProblem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const bioLength = [...(cleanBio(form.bio) ?? "")].length;
  const unchanged =
    cleanBio(form.bio) === about.bio &&
    parseX(form.x) === about.x &&
    parseTelegram(form.telegram) === about.telegram &&
    parseWebsite(form.website) === about.website;

  function set(field: keyof ProfileInput, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setProblem(null);
    setError(null);
    setSaved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || unchanged) return;
    const checked = checkProfile(form);
    if (!checked.ok) return setProblem(checked);
    setSaving(true);
    try {
      await saveProfile(form);
      const { bio, x, telegram, website } = checked.profile;
      setForm({ bio: bio ?? "", x: x ?? "", telegram: telegram ?? "", website: website ?? "" });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const errorOf = (field: keyof ProfileInput) => (problem?.field === field ? problem.error : null);
  return (
    <section className="mt-6 rounded-lg border border-border p-5">
      <h2 className="text-sm font-medium">Profile</h2>
      <p className="mt-1 mb-5 text-sm text-muted">What people see on your caller page, next to your calls.</p>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="bio" className="label text-subtle">
            Bio
          </label>
          <div className={clsx(FIELD, "mt-2 py-2")}>
            <textarea
              id="bio"
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
              aria-invalid={!!errorOf("bio")}
              aria-describedby="bio-hint"
              rows={3}
              maxLength={BIO_MAX * 2}
              placeholder="What you call, and how."
              className="block w-full resize-none bg-transparent text-sm outline-none placeholder:text-subtle/60"
            />
          </div>
          <Hint id="bio-hint" error={errorOf("bio")}>
            <span className={clsx("tabular font-mono", bioLength > BIO_MAX && "text-down")}>
              {bioLength}/{BIO_MAX}
            </span>
          </Hint>
        </div>
        <LinkField
          handle
          id="x"
          label="X"
          icon={<XLogo className="size-3" />}
          value={form.x}
          onChange={(v) => set("x", v)}
          placeholder="your_x_name"
          help={`${X_HELP} Shows on your profile once verified.`}
          error={errorOf("x")}
        />
        <LinkField
          handle
          id="telegram"
          label="Telegram"
          icon={<Send className="size-3" aria-hidden />}
          value={form.telegram}
          onChange={(v) => set("telegram", v)}
          placeholder="your_telegram"
          help={TELEGRAM_HELP}
          error={errorOf("telegram")}
        />
        <LinkField
          id="website"
          label="Website"
          icon={<Globe className="size-3" aria-hidden />}
          value={form.website}
          onChange={(v) => set("website", v)}
          placeholder="example.com"
          help={WEBSITE_HELP}
          error={errorOf("website")}
        />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving || unchanged} className={PRIMARY}>
            {saving && <LoaderCircle className="size-4 animate-spin" />}
            Save profile
          </button>
          {saved && <p className="text-xs text-up">Saved.</p>}
        </div>
        {error && (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

/** Proves the X account is yours: post the code from it, paste the link to the post. */
export function XVerify({ userId, username, about }: { userId: string; username: string; about: CallerAbout }) {
  const { verifyX } = useAuth();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!about.x) return null;

  if (about.xVerified) {
    return (
      <section className="mt-6 rounded-lg border border-border p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <XLogo className="size-3" /> X account
        </h2>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <Check className="size-4 shrink-0 text-up" aria-hidden />
          <span>
            Verified as <span className="font-mono text-fg">@{about.x}</span>. It shows on your profile.
          </span>
        </p>
      </section>
    );
  }

  const text = xPostText(xCode(userId, about.x), `${window.location.origin}${callerHref(username)}`);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyX(link.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-border-strong bg-surface p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <XLogo className="size-3" /> Verify <span className="font-mono">@{about.x}</span>
      </h2>
      <p className="mt-1 text-sm text-muted">
        Your X account shows on your profile once it&apos;s proven yours: post this from{" "}
        <span className="font-mono text-fg">@{about.x}</span>, then paste the link to the post. You can delete the
        post afterwards.
      </p>
      <pre className="mt-4 rounded-lg border border-border bg-bg p-3 font-mono text-xs break-words whitespace-pre-wrap select-all">
        {text}
      </pre>
      <div className="mt-2 flex gap-2">
        <a
          href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(SECONDARY, "flex-1")}
        >
          <XLogo /> Post on X
        </a>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: the text is selectable */
            }
          }}
          className={clsx(SECONDARY, "flex-1")}
        >
          {copied ? <Check className="size-4 text-up" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <form onSubmit={submit} className="mt-5">
        <label htmlFor="x-post" className="label text-subtle">
          Link to your post
        </label>
        <div className="mt-2 flex gap-2">
          <div className={clsx(FIELD, "flex h-10 min-w-0 flex-1 items-center")}>
            <input
              id="x-post"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setError(null);
              }}
              inputMode="url"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              placeholder={`https://x.com/${about.x}/status/…`}
              className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-subtle/60"
            />
          </div>
          <button type="submit" disabled={!link.trim() || busy} className={clsx(PRIMARY, "h-10")}>
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Verify
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-down">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
