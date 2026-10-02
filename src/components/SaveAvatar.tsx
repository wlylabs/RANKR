"use client";

import { Download } from "lucide-react";
import { avatarCells, avatarFile } from "@/lib/avatar";
import { PROFILE_ACTION } from "./ProfileHeader";

// The saved picture: 1024px, the dark tile (surface-2, cells in fg) filling the square, and the matrix a little
// further in than on the app's tile, so the round crop of X and Telegram doesn't clip a corner cell.
const SIZE = 1024;
const PAD = (SIZE * 14) / 64;
const CELL = (SIZE - 2 * PAD) / 5;
const GAP = CELL * 0.2;

/** The avatar (see avatarCells) as a PNG, drawn right here: nothing to fetch. Null without a canvas. */
function avatarPng(userId: string): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#171717";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#EDEDED";
  for (const [c, r] of avatarCells(userId)) {
    ctx.beginPath();
    ctx.roundRect(PAD + c * CELL + GAP / 2, PAD + r * CELL + GAP / 2, CELL - GAP, CELL - GAP, CELL * 0.2);
    ctx.fill();
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Saves your avatar as a 1024px PNG (rankr-<username>.png), to use as a profile picture elsewhere. */
export function SaveAvatar({ userId, username }: { userId: string; username: string }) {
  async function save() {
    const blob = await avatarPng(userId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = avatarFile(username);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button type="button" onClick={save} className={PROFILE_ACTION} title="Save your avatar as a PNG">
      <Download className="size-3.5" />
      <span className="max-sm:sr-only">Save avatar</span>
    </button>
  );
}
