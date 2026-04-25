import type { Channel, ChannelAvailability, Contact, MessageCategory } from "../types.js";

export interface ChannelScore {
  channel: Channel;
  score: number;
  reason: string;
}

export interface ScoringStrategy {
  name: string;
  score(
    contact: Contact,
    channel: Channel,
    category: MessageCategory
  ): number;
}

// ---------------------------------------------------------------------------
// Engagement-weighted strategy (primary)
// ---------------------------------------------------------------------------

export class EngagementScoringStrategy implements ScoringStrategy {
  readonly name = "engagement";

  score(contact: Contact, channel: Channel, _category: MessageCategory): number {
    const avail = contact.channels.find((c) => c.channel === channel);
    if (!avail || !avail.available) return 0;

    // Weighted blend: reply > open > delivery
    const replyWeight = 0.5;
    const openWeight = 0.3;
    const deliveryWeight = 0.2;

    return (
      avail.replyRate * replyWeight +
      avail.openRate * openWeight +
      avail.deliveryRate * deliveryWeight
    );
  }
}

// ---------------------------------------------------------------------------
// Recency boost: channels with recent activity score higher
// ---------------------------------------------------------------------------

export class RecencyScoringStrategy implements ScoringStrategy {
  readonly name = "recency";

  score(contact: Contact, channel: Channel, _category: MessageCategory): number {
    const avail = contact.channels.find((c) => c.channel === channel);
    if (!avail || !avail.available) return 0;

    const lastActive =
      avail.lastReplied ?? avail.lastOpened ?? avail.lastDelivered;
    if (!lastActive) return 0.1;

    const daysSince = (Date.now() - new Date(lastActive).getTime()) / 86_400_000;
    return Math.max(0, 1 - daysSince / 90); // decay over 90 days
  }
}

// ---------------------------------------------------------------------------
// Cost strategy (tiebreaker)
// ---------------------------------------------------------------------------

const CHANNEL_COST_RANK: Record<Channel, number> = {
  push_fcm: 1.0,
  push_apns: 1.0,
  in_app: 1.0,
  email: 0.9,
  sms: 0.6,
  whatsapp: 0.7,
  rcs: 0.65,
  imessage_business: 0.75,
};

export class CostScoringStrategy implements ScoringStrategy {
  readonly name = "cost";

  score(_contact: Contact, channel: Channel, _category: MessageCategory): number {
    return CHANNEL_COST_RANK[channel] ?? 0.5;
  }
}

// ---------------------------------------------------------------------------
// Composite scorer
// ---------------------------------------------------------------------------

export interface WeightedStrategy {
  strategy: ScoringStrategy;
  weight: number;
}

export class CompositeScorer {
  #strategies: WeightedStrategy[];

  constructor(strategies: WeightedStrategy[]) {
    const total = strategies.reduce((s, w) => s + w.weight, 0);
    this.#strategies = strategies.map((s) => ({
      ...s,
      weight: s.weight / total, // normalize
    }));
  }

  score(contact: Contact, channel: Channel, category: MessageCategory): number {
    return this.#strategies.reduce(
      (acc, { strategy, weight }) =>
        acc + strategy.score(contact, channel, category) * weight,
      0
    );
  }

  /** Default composition: engagement 70%, recency 20%, cost 10% */
  static default(): CompositeScorer {
    return new CompositeScorer([
      { strategy: new EngagementScoringStrategy(), weight: 0.7 },
      { strategy: new RecencyScoringStrategy(), weight: 0.2 },
      { strategy: new CostScoringStrategy(), weight: 0.1 },
    ]);
  }
}

export function rankChannels(
  contact: Contact,
  category: MessageCategory,
  scorer: CompositeScorer
): ChannelScore[] {
  const available = contact.channels
    .filter((c) => c.available)
    .map((c) => c.channel);

  return available
    .map((channel) => ({
      channel,
      score: scorer.score(contact, channel, category),
      reason: `composite score for ${channel}`,
    }))
    .sort((a, b) => b.score - a.score);
}
