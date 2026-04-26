import type { SendResult } from "../types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IdempotencyStore {
  get(key: string): Promise<SendResult | undefined>;
  set(key: string, result: SendResult): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory (default — process-scoped)
// ---------------------------------------------------------------------------

export class MemoryIdempotencyStore implements IdempotencyStore {
  #cache = new Map<string, SendResult>();

  async get(key: string): Promise<SendResult | undefined> {
    return this.#cache.get(key);
  }

  async set(key: string, result: SendResult): Promise<void> {
    this.#cache.set(key, result);
  }
}

// ---------------------------------------------------------------------------
// Redis (cross-process, persistent)
// Requires `ioredis` — lazy import so it's optional.
// ---------------------------------------------------------------------------

export interface RedisIdempotencyStoreOptions {
  /** Redis connection URL, e.g. "redis://localhost:6379" */
  url: string;
  /** Key TTL in seconds; default 86400 (24h) */
  ttlSeconds?: number;
  /** Key prefix; default "nudge:idem:" */
  prefix?: string;
}

type RedisConstructor = new (url: string) => {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, flag: string, ttl: number): Promise<unknown>;
};

async function loadRedis(): Promise<RedisConstructor> {
  try {
    const mod = await import("ioredis" as string) as { default?: RedisConstructor } | RedisConstructor;
    const ctor = (typeof mod === "function" ? mod : (mod as { default?: RedisConstructor }).default) as RedisConstructor | undefined;
    if (!ctor) throw new Error("no default export");
    return ctor;
  } catch {
    throw new Error("RedisIdempotencyStore requires ioredis: npm install ioredis");
  }
}

export class RedisIdempotencyStore implements IdempotencyStore {
  #opts: Required<RedisIdempotencyStoreOptions>;
  #client: InstanceType<RedisConstructor> | null = null;

  constructor(opts: RedisIdempotencyStoreOptions) {
    this.#opts = {
      url: opts.url,
      ttlSeconds: opts.ttlSeconds ?? 86400,
      prefix: opts.prefix ?? "nudge:idem:",
    };
  }

  async get(key: string): Promise<SendResult | undefined> {
    const client = await this.#connect();
    const raw = await client.get(this.#key(key));
    if (!raw) return undefined;
    return JSON.parse(raw) as SendResult;
  }

  async set(key: string, result: SendResult): Promise<void> {
    const client = await this.#connect();
    await client.set(this.#key(key), JSON.stringify(result), "EX", this.#opts.ttlSeconds);
  }

  #key(key: string): string {
    return `${this.#opts.prefix}${key}`;
  }

  async #connect(): Promise<InstanceType<RedisConstructor>> {
    if (this.#client) return this.#client;
    const Redis = await loadRedis();
    this.#client = new Redis(this.#opts.url);
    return this.#client;
  }
}
