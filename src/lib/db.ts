import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = process.env.RANKR_DB_PATH ?? join(process.cwd(), "data", "rankr.sqlite");

declare global {
  var __rankrDb: DatabaseSync | undefined;
}

function openDatabase(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS entrants (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      total_cents INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      entrant_id TEXT NOT NULL REFERENCES entrants(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_entrant ON payments(entrant_id);`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_entrants_rank ON entrants(total_cents DESC, updated_at ASC);`,
  );

  return db;
}

/**
 * Reused across hot reloads in dev so we don't open a second handle
 * on the same WAL-mode SQLite file.
 */
export function getDb(): DatabaseSync {
  if (!globalThis.__rankrDb) {
    globalThis.__rankrDb = openDatabase();
  }
  return globalThis.__rankrDb;
}
