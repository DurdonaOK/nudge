import type {
  Channel,
  Contact,
  MessageCategory,
  ProviderAdapter,
  RenderedContent,
  RoutingDecision,
  RoutingOverride,
  Template,
} from "../types.js";
import { AdapterRegistry } from "../adapters/registry.js";
import { CompositeScorer, rankChannels } from "./scorer.js";
import { isOptedIn } from "../contacts/store.js";

export interface RoutingEngineOptions {
  registry: AdapterRegistry;
  scorer?: CompositeScorer;
  /** Channels that can never be used as fallbacks (e.g. RCS if template uses RCS-only buttons) */
  disabledFallbacks?: Channel[];
}

export class RoutingEngine {
  #registry: AdapterRegistry;
  #scorer: CompositeScorer;
  #disabledFallbacks: Set<Channel>;

  constructor(opts: RoutingEngineOptions) {
    this.#registry = opts.registry;
    this.#scorer = opts.scorer ?? CompositeScorer.default();
    this.#disabledFallbacks = new Set(opts.disabledFallbacks ?? []);
  }

  async route(
    contact: Contact,
    template: Template,
    override?: RoutingOverride
  ): Promise<RoutingDecision> {
    const category = template.category;

    if (override) {
      return this.#buildDecision(contact, override.channel, override.provider, category, []);
    }

    // Restrict to channels the template supports
    const eligibleChannels = (template.channels ?? this.#allAvailableChannels(contact)).filter(
      (ch) => {
        const adapters = this.#registry.forChannel(ch);
        return (
          adapters.length > 0 &&
          isOptedIn(contact, ch, category) &&
          contact.channels.some((c) => c.channel === ch && c.available)
        );
      }
    );

    if (eligibleChannels.length === 0) {
      throw new Error(
        `No eligible channel for contact ${contact.id} (template ${template.id})`
      );
    }

    const ranked = rankChannels(contact, category, this.#scorer).filter((r) =>
      eligibleChannels.includes(r.channel)
    );

    const [best, ...rest] = ranked;
    if (!best) throw new Error("No ranked channels available");

    const bestAdapters = this.#registry.forChannel(best.channel);
    const provider = bestAdapters[0]?.name ?? "unknown";

    const fallbacks = rest
      .filter((r) => !this.#disabledFallbacks.has(r.channel))
      .slice(0, 3)
      .map((r) => ({
        channel: r.channel,
        provider: this.#registry.forChannel(r.channel)[0]?.name ?? "unknown",
      }));

    return this.#buildDecision(contact, best.channel, provider, category, fallbacks);
  }

  async #buildDecision(
    contact: Contact,
    channel: Channel,
    provider: string,
    _category: MessageCategory,
    fallbacks: Array<{ channel: Channel; provider: string }>
  ): Promise<RoutingDecision> {
    const adapter = this.#registry.get(provider);
    const estimatedCostUsd = adapter
      ? await this.#estimateCost(adapter, channel)
      : 0;

    return {
      channel,
      provider,
      score: this.#scorer.score(contact, channel, _category),
      reason: `selected via engagement-weighted routing`,
      estimatedCostUsd,
      estimatedDeliveryMs: this.#estimateDelivery(channel),
      fallbacks,
    };
  }

  #estimateDelivery(channel: Channel): number {
    const ms: Record<Channel, number> = {
      push_fcm: 500,
      push_apns: 500,
      in_app: 100,
      sms: 3000,
      whatsapp: 2000,
      rcs: 2000,
      email: 5000,
      imessage_business: 1000,
    };
    return ms[channel] ?? 3000;
  }

  async #estimateCost(adapter: ProviderAdapter, channel: Channel): Promise<number> {
    try {
      const stub = { channel } as RenderedContent;
      return await adapter.estimateCost(stub);
    } catch {
      return 0;
    }
  }

  #allAvailableChannels(contact: Contact): Channel[] {
    return contact.channels.filter((c) => c.available).map((c) => c.channel);
  }
}
