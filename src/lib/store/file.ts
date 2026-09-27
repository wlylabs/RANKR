import { promises as fs } from "node:fs";
import path from "node:path";
import { applySnapshot } from "../metrics";
import type { TokenRecord } from "../types";
import { queryRecords, repaste, staleRecords, statsOfRecords } from "./memory";
import type { MarketUpdate, Store, TokenQuery } from "./types";

/**
 * JSON file on disk, for local dev and single-server deploys. If the disk is not writable
 * it keeps working in memory and logs a warning once.
 */
export class FileStore implements Store {
  private records: Map<string, TokenRecord> | null = null;
  private loading: Promise<void> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private warned = false;

  constructor(private file: string) {}

  private async load(): Promise<Map<string, TokenRecord>> {
    if (!this.records) {
      this.loading ??= fs
        .readFile(this.file, "utf8")
        .then((text) => {
          const list = JSON.parse(text) as TokenRecord[];
          this.records = new Map(list.map((r) => [r.id, r]));
        })
        .catch((err: NodeJS.ErrnoException) => {
          if (err.code !== "ENOENT") console.error("[rankr] could not read store:", err.message);
          this.records = new Map();
        });
      await this.loading;
    }
    return this.records!;
  }

  private persist() {
    const snapshot = JSON.stringify([...this.records!.values()]);
    this.writing = this.writing.then(async () => {
      try {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.tmp`;
        await fs.writeFile(tmp, snapshot);
        await fs.rename(tmp, this.file);
      } catch (err) {
        if (!this.warned) console.warn("[rankr] store is memory-only, write failed:", (err as Error).message);
        this.warned = true;
      }
    });
    return this.writing;
  }

  async get(id: string) {
    return (await this.load()).get(id) ?? null;
  }

  async recordPaste(fresh: TokenRecord) {
    const records = await this.load();
    const current = records.get(fresh.id);
    const record = current ? repaste(current, fresh) : fresh;
    records.set(record.id, record);
    await this.persist();
    return { record, created: !current };
  }

  async applyMarket(updates: MarketUpdate[]) {
    const records = await this.load();
    let changed = false;
    for (const u of updates) {
      const r = records.get(u.id);
      if (!r || !(u.snapshot.priceUsd > 0)) continue;
      records.set(u.id, applySnapshot(r, u.snapshot, u.at));
      changed = true;
    }
    if (changed) await this.persist();
  }

  async query(q: TokenQuery) {
    return queryRecords((await this.load()).values(), q);
  }

  async stale(checkedBefore: number, limit: number, deadBefore?: number) {
    return staleRecords((await this.load()).values(), checkedBefore, limit, deadBefore);
  }

  async stats() {
    return statsOfRecords((await this.load()).values());
  }
}
