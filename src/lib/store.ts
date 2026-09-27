import { promises as fs } from "node:fs";
import path from "node:path";
import type { TokenRecord } from "./types";

export interface Store {
  list(): Promise<TokenRecord[]>;
  get(id: string): Promise<TokenRecord | null>;
  /** Inserts only if the id is new. Returns false when someone else recorded it first. */
  create(record: TokenRecord): Promise<boolean>;
  save(records: TokenRecord[]): Promise<void>;
}

/**
 * JSON file on disk. Good for local dev and single-server deploys. If the disk is not
 * writable (e.g. serverless) it keeps working in memory and logs a warning once.
 */
class FileStore implements Store {
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

  async list() {
    return [...(await this.load()).values()];
  }

  async get(id: string) {
    return (await this.load()).get(id) ?? null;
  }

  async create(record: TokenRecord) {
    const records = await this.load();
    if (records.has(record.id)) return false;
    records.set(record.id, record);
    await this.persist();
    return true;
  }

  async save(list: TokenRecord[]) {
    if (!list.length) return;
    const records = await this.load();
    for (const r of list) records.set(r.id, r);
    await this.persist();
  }
}

/** Upstash Redis / Vercel KV over the REST API, for serverless deploys. One hash holds every token. */
class RedisStore implements Store {
  private key = "rankr:tokens";

  constructor(
    private url: string,
    private token: string,
  ) {}

  private async cmd<T>(args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || body.error) throw new Error(`Redis ${args[0]} failed: ${body.error ?? res.status}`);
    return body.result as T;
  }

  async list() {
    const flat = await this.cmd<string[]>(["HGETALL", this.key]);
    const out: TokenRecord[] = [];
    for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]) as TokenRecord);
    return out;
  }

  async get(id: string) {
    const raw = await this.cmd<string | null>(["HGET", this.key, id]);
    return raw ? (JSON.parse(raw) as TokenRecord) : null;
  }

  async create(record: TokenRecord) {
    return (await this.cmd<number>(["HSETNX", this.key, record.id, JSON.stringify(record)])) === 1;
  }

  async save(list: TokenRecord[]) {
    if (!list.length) return;
    await this.cmd(["HSET", this.key, ...list.flatMap((r) => [r.id, JSON.stringify(r)])]);
  }
}

function createStore(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) return new RedisStore(url, token);
  const dir = process.env.RANKR_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  const file = process.env.RANKR_MOCK === "1" ? "rankr.mock.json" : "rankr.json";
  return new FileStore(path.join(/*turbopackIgnore: true*/ dir, file));
}

// One instance per server process (survives dev hot reloads).
const globalStore = globalThis as unknown as { __rankrStore?: Store };
export const store: Store = (globalStore.__rankrStore ??= createStore());
