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
} from "./types.js";

export { AdapterRegistry } from "./adapters/registry.js";
export { TwilioAdapter } from "./adapters/twilio.js";
export { SesAdapter } from "./adapters/ses.js";
export { VonageAdapter } from "./adapters/vonage.js";
export { FcmAdapter } from "./adapters/fcm.js";

export { RoutingEngine } from "./routing/engine.js";
export {
  CompositeScorer,
  EngagementScoringStrategy,
  RecencyScoringStrategy,
  CostScoringStrategy,
} from "./routing/scorer.js";
export { isInQuietHours, optimalSendHour, nextOptimalSendTime } from "./routing/optimizer.js";

export { render, canDegradeTo } from "./templates/engine.js";

export { MemoryContactStore, isOptedIn } from "./contacts/store.js";
export type { ContactStore } from "./contacts/store.js";

export { ConversationManager, MemoryThreadStore } from "./conversation/manager.js";
export { ConversationAgent } from "./conversation/agent.js";

export { checkCompliance, detectOptKeyword } from "./compliance/index.js";

export { EventBus, globalBus } from "./events/bus.js";

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

import { AdapterRegistry } from "./adapters/registry.js";
import { RoutingEngine } from "./routing/engine.js";
import { MemoryContactStore } from "./contacts/store.js";
import { ConversationManager, MemoryThreadStore } from "./conversation/manager.js";
import { send } from "./sender.js";
import type { Contact, Template, TemplateVars, SendOptions, SendResult } from "./types.js";
import type { ProviderAdapter } from "./types.js";

export interface NudgeClientOptions {
  adapters: ProviderAdapter[];
}

export class NudgeClient {
  #registry: AdapterRegistry;
  #router: RoutingEngine;
  #contacts: MemoryContactStore;
  #conversations: ConversationManager;

  constructor(opts: NudgeClientOptions) {
    this.#registry = new AdapterRegistry();
    for (const adapter of opts.adapters) {
      this.#registry.register(adapter);
    }
    this.#router = new RoutingEngine({ registry: this.#registry });
    this.#contacts = new MemoryContactStore();
    this.#conversations = new ConversationManager(new MemoryThreadStore());
  }

  async send(
    contact: Contact,
    template: Template,
    vars: TemplateVars,
    opts?: SendOptions
  ): Promise<SendResult> {
    await this.#contacts.upsert(contact);
    return send(contact, template, vars, opts ?? {}, {
      registry: this.#registry,
      contacts: this.#contacts,
      router: this.#router,
      conversations: this.#conversations,
    });
  }

  get contacts(): MemoryContactStore {
    return this.#contacts;
  }

  get conversations(): ConversationManager {
    return this.#conversations;
  }
}
