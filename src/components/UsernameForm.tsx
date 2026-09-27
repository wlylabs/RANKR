"use client";

import clsx from "clsx";
import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/supabase-browser";
import { checkUsername, USERNAME_HELP, usernameMessage } from "@/lib/username";
import { useAuth } from "./AuthProvider";

type Check = { name: string; available: boolean; error?: string };

/** Username input with a live availability check. Used to pick one after sign-up and to change it. */
export function UsernameForm({
  initial = "",
  current,
  submitLabel,
  onSaved,
}: {
  initial?: string;
  current?: string | null;
  submitLabel: string;
  onSaved?: (username: string) => void;
}) {
  const { saveUsername } = useAuth();
  const [name, setName] = useState(initial);
  const [check, setCheck] = useState<Check | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = name.trim();
  const local = value ? checkUsername(value) : null;
  const unchanged = !!current && value === current;

  useEffect(() => {
    if (!value || local || unchanged) return;
    let live = true;
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/username?name=${encodeURIComponent(value)}`);
        const body = await res.json();
        if (live && res.ok) setCheck({ name: value, available: body.available, error: body.error });
      } catch {
        /* the save will tell */
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [value, local, unchanged]);

  const checked = check?.name === value ? check : null;
  const status: { tone: "up" | "down" | "muted"; text: string } | null = error
    ? { tone: "down", text: error }
    : !value
      ? { tone: "muted", text: USERNAME_HELP }
      : local
        ? { tone: "down", text: usernameMessage(local) }
        : unchanged
          ? { tone: "muted", text: "That's your username now." }
          : !checked
            ? { tone: "muted", text: "Checking…" }
            : checked.available
              ? { tone: "up", text: "Available" }
              : { tone: "down", text: checked.error ?? usernameMessage("taken") };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value || local || unchanged || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveUsername(value);
      onSaved?.(value);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const blocked = !value || !!local || unchanged || checked?.available === false;
  return (
    <form onSubmit={submit}>
      <label htmlFor="username" className="label text-subtle">
        Username
      </label>
      <div className="mt-2 flex h-11 items-center rounded-lg border border-border bg-surface px-3 transition-colors focus-within:border-border-strong">
        <span className="font-mono text-subtle">@</span>
        <input
          id="username"
          value={name}
          onChange={(e) => {
            setName(e.target.value.replace(/\s/g, "_"));
            setError(null);
          }}
          maxLength={20}
          autoFocus={!current}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="degen_caller"
          className="min-w-0 flex-1 bg-transparent pl-0.5 font-mono outline-none placeholder:text-subtle/60"
        />
        {checked?.available && !local && !unchanged && <Check className="size-4 shrink-0 text-up" />}
      </div>
      <p
        aria-live="polite"
        className={clsx(
          "mt-2 min-h-5 text-xs",
          status?.tone === "up" ? "text-up" : status?.tone === "down" ? "text-down" : "text-subtle",
        )}
      >
        {status?.text}
      </p>
      <button
        type="submit"
        disabled={blocked || saving}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-fg text-sm font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {saving && <LoaderCircle className="size-4 animate-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}
