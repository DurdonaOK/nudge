import type { Template } from "../types.js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface TemplateStore {
  get(id: string): Promise<Template | undefined>;
  set(template: Template): Promise<void>;
  list(): Promise<Template[]>;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

export class MemoryTemplateStore implements TemplateStore {
  #templates = new Map<string, Template>();

  constructor(templates?: Template[]) {
    for (const t of templates ?? []) {
      this.#templates.set(t.id, t);
    }
  }

  async get(id: string): Promise<Template | undefined> {
    return this.#templates.get(id);
  }

  async set(template: Template): Promise<void> {
    this.#templates.set(template.id, template);
  }

  async list(): Promise<Template[]> {
    return [...this.#templates.values()];
  }
}

// ---------------------------------------------------------------------------
// File-based store — reads from a JSON file of Template[]
// Watches for changes at runtime (best-effort)
// ---------------------------------------------------------------------------

export class FileTemplateStore implements TemplateStore {
  #path: string;
  #cache: Map<string, Template> = new Map();
  #loadedAt = 0;

  constructor(filePath: string) {
    this.#path = resolve(filePath);
    this.#load();
  }

  async get(id: string): Promise<Template | undefined> {
    this.#maybeReload();
    return this.#cache.get(id);
  }

  async set(template: Template): Promise<void> {
    this.#cache.set(template.id, template);
  }

  async list(): Promise<Template[]> {
    this.#maybeReload();
    return [...this.#cache.values()];
  }

  #load(): void {
    if (!existsSync(this.#path)) return;
    try {
      const raw = readFileSync(this.#path, "utf-8");
      const templates = JSON.parse(raw) as Template[];
      this.#cache = new Map(templates.map((t) => [t.id, t]));
      this.#loadedAt = Date.now();
    } catch (err) {
      console.warn(`[nudge] Failed to load templates from ${this.#path}:`, err);
    }
  }

  #maybeReload(): void {
    // Reload at most once per 5 seconds
    if (Date.now() - this.#loadedAt > 5000) this.#load();
  }
}
