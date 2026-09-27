// Concatenates supabase/migrations/*.sql (in order) into supabase/setup.sql, a single file
// to paste into the Supabase SQL editor. Run after changing a migration: npm run db:bundle
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "supabase", "migrations");

export function bundle() {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const parts = files.map((f) => `-- ===== ${f} =====\n\n${readFileSync(path.join(dir, f), "utf8").trim()}\n`);
  return [
    "-- Rankr: complete database setup. Paste this whole file into the Supabase SQL editor and run it.",
    "-- Safe to run again. Generated from supabase/migrations by `npm run db:bundle`; edit those, not this.",
    "",
    parts.join("\n"),
  ].join("\n");
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  writeFileSync(path.join(root, "supabase", "setup.sql"), bundle());
  console.log("wrote supabase/setup.sql");
}
