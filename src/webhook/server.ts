import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type { ProviderAdapter } from "../types.js";
import { AdapterRegistry } from "../adapters/registry.js";
import { EventBus } from "../events/bus.js";
import { detectOptKeyword } from "../compliance/index.js";

// ---------------------------------------------------------------------------
// Webhook HTTP server
// Mounts at /webhooks/:provider and routes to the matching adapter's
// parseWebhook(), then emits the event on the bus.
// ---------------------------------------------------------------------------

export interface WebhookServerOptions {
  port?: number;
  registry: AdapterRegistry;
  bus: EventBus;
  /** Optional shared secret for basic HMAC validation (provider-agnostic) */
  secret?: string;
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function headers(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v)) out[k] = v[0] ?? "";
  }
  return out;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function createWebhookServer(opts: WebhookServerOptions) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost`);

    // Health check
    if (url.pathname === "/health") {
      return json(res, 200, { ok: true });
    }

    // Route: POST /webhooks/:provider
    const match = /^\/webhooks\/([^/]+)$/.exec(url.pathname);
    if (!match || req.method !== "POST") {
      return json(res, 404, { error: "Not found" });
    }

    const providerName = match[1]!;
    const adapter = opts.registry.get(providerName);
    if (!adapter) {
      return json(res, 404, { error: `No adapter registered for provider: ${providerName}` });
    }

    let rawBody: string;
    let parsed: unknown;
    try {
      rawBody = await readBody(req);
      parsed = JSON.parse(rawBody);
    } catch {
      return json(res, 400, { error: "Invalid JSON body" });
    }

    try {
      const event = adapter.parseWebhook(parsed, headers(req));

      // Auto opt-out detection on inbound reply text
      if (event.type === "reply" && typeof (parsed as Record<string, unknown>)["Body"] === "string") {
        const keyword = detectOptKeyword((parsed as Record<string, string>)["Body"] ?? "");
        if (keyword === "opt_out") {
          await opts.bus.emit({ ...event, type: "opt_out" });
        } else if (keyword === "opt_in") {
          await opts.bus.emit({ ...event, type: "opt_in" });
        } else {
          await opts.bus.emit(event);
        }
      } else {
        await opts.bus.emit(event);
      }

      return json(res, 200, { received: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Parse error";
      return json(res, 400, { error: message });
    }
  });

  return {
    start(): Promise<void> {
      return new Promise((resolve) => {
        server.listen(opts.port ?? 3001, () => {
          console.log(`[nudge] Webhook server listening on port ${opts.port ?? 3001}`);
          resolve();
        });
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    },
    server,
  };
}
