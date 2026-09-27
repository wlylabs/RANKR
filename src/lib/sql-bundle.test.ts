import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const supabase = path.join(__dirname, "../../supabase");

describe("supabase/setup.sql", () => {
  it("contains every migration, in order (run `npm run db:bundle` after editing one)", () => {
    const setup = readFileSync(path.join(supabase, "setup.sql"), "utf8");
    const files = readdirSync(path.join(supabase, "migrations")).filter((f) => f.endsWith(".sql")).sort();
    let from = 0;
    for (const f of files) {
      const body = readFileSync(path.join(supabase, "migrations", f), "utf8").trim();
      const at = setup.indexOf(body, from);
      expect(at, `${f} missing or out of date in setup.sql`).toBeGreaterThanOrEqual(0);
      from = at + body.length;
    }
  });
});
