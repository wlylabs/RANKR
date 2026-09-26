import { getDb } from "@/lib/db";
import { generateId } from "@/lib/id";
import { colorFor, initialsFor } from "@/lib/avatar";
import type { LeaderboardEntry } from "@/types";

interface EntrantRow {
  id: string;
  display_name: string;
  initials: string;
  color: string;
  total_cents: number;
  created_at: number;
  updated_at: number;
}

function toEntry(row: EntrantRow, rank: number): LeaderboardEntry {
  return {
    id: row.id,
    displayName: row.display_name,
    initials: row.initials,
    color: row.color,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rank,
  };
}

export const MIN_CLAIM_CENTS = 100; // $1.00
export const MAX_CLAIM_CENTS = 10_000_000; // $100,000.00

export function listLeaderboard(limit = 200): LeaderboardEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM entrants ORDER BY total_cents DESC, updated_at ASC LIMIT ?`,
    )
    .all(limit) as unknown as EntrantRow[];

  return rows.map((row, index) => toEntry(row, index + 1));
}

export function findEntrant(id: string): EntrantRow | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM entrants WHERE id = ?`).get(id) as
    | EntrantRow
    | undefined;
}

interface ClaimInput {
  entrantId?: string;
  displayName: string;
  amountCents: number;
}

interface ClaimResult {
  entrant: LeaderboardEntry;
  paymentCents: number;
  leaderboard: LeaderboardEntry[];
}

export function recordClaim(input: ClaimInput): ClaimResult {
  const db = getDb();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = input.entrantId ? findEntrant(input.entrantId) : undefined;
    let entrantId: string;

    if (existing) {
      entrantId = existing.id;
      db.prepare(
        `UPDATE entrants SET total_cents = total_cents + ?, updated_at = ? WHERE id = ?`,
      ).run(input.amountCents, now, existing.id);
    } else {
      entrantId = generateId("entrant");
      db.prepare(
        `INSERT INTO entrants (id, display_name, initials, color, total_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entrantId,
        input.displayName,
        initialsFor(input.displayName),
        colorFor(input.displayName + entrantId),
        input.amountCents,
        now,
        now,
      );
    }

    db.prepare(
      `INSERT INTO payments (id, entrant_id, amount_cents, created_at) VALUES (?, ?, ?, ?)`,
    ).run(generateId("payment"), entrantId, input.amountCents, now);

    db.exec("COMMIT");

    const leaderboard = listLeaderboard();
    const entrant = leaderboard.find((entry) => entry.id === entrantId);
    if (!entrant) {
      throw new Error("Entrant vanished immediately after being written.");
    }

    return { entrant, paymentCents: input.amountCents, leaderboard };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
