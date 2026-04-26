export { send } from "./sender.js";
export type {
  Channel,
  Contact,
  ChannelAvailability,
  OptInState,
  QuietHours,
  Template,
  TemplateVars,
  SendOptions,
  SendResult,
  SendError,
  DeliveryStatus,
  RenderedContent,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  WebhookEvent,
  WebhookEventType,
  ConversationThread,
  ConversationMessage,
  MessageCategory,
  RoutingDecision,
  RoutingOverride,
  ComplianceCheck,
  RcsAction,
  RcsRichCard,
  RcsCarouselCard,
  RcsMediaHeight,
  RcsCardOrientation,
} from "./types.js";

export { AdapterRegistry } from "./adapters/registry.js";
export { TwilioAdapter } from "./adapters/twilio.js";
export type { TwilioConfig } from "./adapters/twilio.js";
export { SesAdapter } from "./adapters/ses.js";
export type { SesConfig } from "./adapters/ses.js";
export { VonageAdapter } from "./adapters/vonage.js";
export type { VonageConfig } from "./adapters/vonage.js";
export { FcmAdapter } from "./adapters/fcm.js";
export type { FcmConfig } from "./adapters/fcm.js";
export { ApnsAdapter } from "./adapters/apns.js";
export type { ApnsConfig } from "./adapters/apns.js";
export { MessageBirdAdapter } from "./adapters/messagebird.js";
export type { MessageBirdConfig } from "./adapters/messagebird.js";
export { ResendAdapter } from "./adapters/resend.js";
export type { ResendConfig } from "./adapters/resend.js";
export { TextbeltAdapter } from "./adapters/textbelt.js";
export type { TextbeltConfig } from "./adapters/textbelt.js";

export { RoutingEngine } from "./routing/engine.js";
export {
  CompositeScorer,
  EngagementScoringStrategy,
  RecencyScoringStrategy,
  CostScoringStrategy,
} from "./routing/scorer.js";
export { isInQuietHours, optimalSendHour, nextOptimalSendTime } from "./routing/optimizer.js";

export { render, canDegradeTo } from "./templates/engine.js";
export { MemoryTemplateStore, FileTemplateStore } from "./templates/store.js";
export type { TemplateStore } from "./templates/store.js";

export { MemoryContactStore, isOptedIn } from "./contacts/store.js";
export type { ContactStore } from "./contacts/store.js";

export { MemoryIdempotencyStore, RedisIdempotencyStore } from "./idempotency/store.js";
export type { IdempotencyStore } from "./idempotency/store.js";

export { ConversationManager, MemoryThreadStore } from "./conversation/manager.js";
export { ConversationAgent } from "./conversation/agent.js";

export { checkCompliance, detectOptKeyword } from "./compliance/index.js";

export { EventBus, globalBus } from "./events/bus.js";

export { createWebhookServer } from "./webhook/server.js";
export type { WebhookServerOptions } from "./webhook/server.js";

export { assignVariant, AbTracker, globalAbTracker } from "./ab/index.js";
export type { AbExperiment, AbVariant, AbResult } from "./ab/index.js";

export { MetricsCollector, globalMetrics } from "./metrics/index.js";
export type { SendMetric, ChannelStats } from "./metrics/index.js";

// ---------------------------------------------------------------------------
// NudgeClient — batteries-included factory
// ---------------------------------------------------------------------------

import { AdapterRegistry } from "./adapters/registry.js";
import { RoutingEngine } from "./routing/engine.js";
import { MemoryContactStore } from "./contacts/store.js";
import { MemoryIdempotencyStore } from "./idempotency/store.js";
import { ConversationManager, MemoryThreadStore } from "./conversation/manager.js";
import { EventBus } from "./events/bus.js";
import { send } from "./sender.js";
import type {
  Contact,
  Template,
  TemplateVars,
  SendOptions,
  SendResult,
  ProviderAdapter,
} from "./types.js";
import type { IdempotencyStore } from "./idempotency/store.js";
import type { TemplateStore } from "./templates/store.js";

export interface NudgeClientOptions {
  adapters: ProviderAdapter[];
  idempotency?: IdempotencyStore;
  templates?: TemplateStore;
}

export class NudgeClient {
  #registry: AdapterRegistry;
  #router: RoutingEngine;
  #contacts: MemoryContactStore;
  #conversations: ConversationManager;
  #idempotency: IdempotencyStore;
  #templates: TemplateStore | undefined;
  #bus: EventBus;

  constructor(opts: NudgeClientOptions) {
    this.#registry = new AdapterRegistry();
    for (const adapter of opts.adapters) this.#registry.register(adapter);
    this.#router = new RoutingEngine({ registry: this.#registry });
    this.#contacts = new MemoryContactStore();
    this.#conversations = new ConversationManager(new MemoryThreadStore());
    this.#idempotency = opts.idempotency ?? new MemoryIdempotencyStore();
    this.#templates = opts.templates;
    this.#bus = new EventBus();
  }

  async send(
    contact: Contact,
    template: Template | string,
    vars: TemplateVars,
    opts?: SendOptions
  ): Promise<SendResult> {
    await this.#contacts.upsert(contact);
    let resolved: Template;
    if (typeof template === "string") {
      if (!this.#templates) throw new Error("Pass a TemplateStore to look up templates by ID");
      const found = await this.#templates.get(template);
      if (!found) throw new Error(`Template not found: ${template}`);
      resolved = found;
    } else {
      resolved = template;
    }
    return send(contact, resolved, vars, opts ?? {}, {
      registry: this.#registry,
      contacts: this.#contacts,
      router: this.#router,
      conversations: this.#conversations,
      idempotency: this.#idempotency,
    });
  }

  get contacts(): MemoryContactStore { return this.#contacts; }
  get conversations(): ConversationManager { return this.#conversations; }
  get bus(): EventBus { return this.#bus; }
  get registry(): AdapterRegistry { return this.#registry; }
}
