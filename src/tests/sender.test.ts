import { describe, it, expect } from "vitest";
import type {
  Contact,
  Template,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  RenderedContent,
  WebhookEvent,
} from "../types.js";
import { send } from "../sender.js";
import { AdapterRegistry } from "../adapters/registry.js";
import { RoutingEngine } from "../routing/engine.js";
import { MemoryContactStore } from "../contacts/store.js";

// ---------------------------------------------------------------------------
// Stub adapter that records what was sent
// ---------------------------------------------------------------------------

class StubAdapter implements ProviderAdapter {
  readonly name = "stub";
  readonly capabilities: ProviderCapabilities = {
    channels: ["sms"],
    supportsDeliveryReceipts: false,
    supportsReadReceipts: false,
    supportsRichContent: false,
  };
  sent: RenderedContent[] = [];

  async send(payload: RenderedContent): Promise<ProviderSendResult> {
    this.sent.push(payload);
    return { providerMessageId: "stub-msg-1", status: "sent", costUsd: 0.008 };
  }

  parseWebhook(_body: unknown, _headers: Record<string, string>): WebhookEvent {
    throw new Error("not implemented");
  }

  async estimateCost(_payload: RenderedContent): Promise<number> {
    return 0.008;
  }
}

function makeContact(): Contact {
  return {
    id: "c1",
    phone: "+15555550100",
    locale: "en-US",
    timezone: "America/New_York",
    channels: [
      { channel: "sms", available: true, deliveryRate: 0.95, openRate: 0.3, replyRate: 0.05 },
    ],
    optIns: [
      { channel: "sms", category: "transactional", optedIn: true, updatedAt: "", source: "explicit" },
    ],
    metadata: {},
  };
}

function makeTemplate(): Template {
  return {
    id: "t1",
    body: "Hello {{name}}!",
    category: "transactional",
  };
}

function makeDeps(adapter?: StubAdapter) {
  const registry = new AdapterRegistry();
  if (adapter) registry.register(adapter);
  const contacts = new MemoryContactStore();
  const router = new RoutingEngine({ registry });
  return { registry, contacts, router };
}

describe("sender — dry run", () => {
  it("returns dry_run status without calling adapter", async () => {
    const adapter = new StubAdapter();
    const deps = makeDeps(adapter);
    const result = await send(makeContact(), makeTemplate(), { name: "Alice" }, { dryRun: true }, deps);
    expect(result.status).toBe("dry_run");
    expect(result.dryRun).toBe(true);
    expect(adapter.sent).toHaveLength(0);
  });

  it("dry_run result contains rendered content", async () => {
    const deps = makeDeps();
    const result = await send(makeContact(), makeTemplate(), { name: "Bob" }, { dryRun: true }, deps);
    expect(result.renderedContent.channel).toBe("sms");
    if (result.renderedContent.channel === "sms") {
      expect(result.renderedContent.body).toBe("Hello Bob!");
    }
  });
});

describe("sender — real send", () => {
  it("calls adapter and returns sent status", async () => {
    const adapter = new StubAdapter();
    const deps = makeDeps(adapter);
    await deps.contacts.upsert(makeContact());
    const result = await send(makeContact(), makeTemplate(), { name: "Alice" }, {}, deps);
    expect(result.status).toBe("sent");
    expect(result.messageId).toBe("stub-msg-1");
    expect(adapter.sent).toHaveLength(1);
  });

  it("records cost from adapter", async () => {
    const adapter = new StubAdapter();
    const deps = makeDeps(adapter);
    const result = await send(makeContact(), makeTemplate(), { name: "Alice" }, {}, deps);
    expect(result.costUsd).toBe(0.008);
  });
});

describe("sender — idempotency", () => {
  it("returns the same result for duplicate idempotency key", async () => {
    const adapter = new StubAdapter();
    const deps = makeDeps(adapter);
    const key = "idem-key-abc";
    const r1 = await send(makeContact(), makeTemplate(), { name: "A" }, { idempotencyKey: key }, deps);
    const r2 = await send(makeContact(), makeTemplate(), { name: "A" }, { idempotencyKey: key }, deps);
    expect(r1.messageId).toBe(r2.messageId);
    // Adapter should only have been called once
    expect(adapter.sent).toHaveLength(1);
  });
});

describe("sender — compliance block", () => {
  it("blocks marketing send without opt-in", async () => {
    const adapter = new StubAdapter();
    const deps = makeDeps(adapter);
    const template: Template = { ...makeTemplate(), category: "marketing" };
    const result = await send(makeContact(), template, {}, {}, deps);
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("COMPLIANCE_BLOCK");
    expect(adapter.sent).toHaveLength(0);
  });
});
