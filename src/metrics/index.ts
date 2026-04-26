import type { Channel, DeliveryStatus } from "../types.js";

// ---------------------------------------------------------------------------
// Per-send metric record
// ---------------------------------------------------------------------------

export interface SendMetric {
  messageId: string;
  channel: Channel;
  provider: string;
  category: string;
  status: DeliveryStatus;
  costUsd: number;
  latencyMs: number;
  /** ISO 8601 */
  timestamp: string;
  abVariant?: string;
}

// ---------------------------------------------------------------------------
// Aggregated stats per channel
// ---------------------------------------------------------------------------

export interface ChannelStats {
  channel: Channel;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  failed: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  deliveryRate: number;
  openRate: number;
  replyRate: number;
}

// ---------------------------------------------------------------------------
// In-memory metrics collector
// ---------------------------------------------------------------------------

export class MetricsCollector {
  #records: SendMetric[] = [];

  record(metric: SendMetric): void {
    this.#records.push(metric);
  }

  /** Aggregate stats per channel over a time window */
  channelStats(since?: Date): ChannelStats[] {
    const cutoff = since?.getTime() ?? 0;
    const filtered = this.#records.filter(
      (r) => new Date(r.timestamp).getTime() >= cutoff
    );

    const byChannel = new Map<Channel, SendMetric[]>();
    for (const r of filtered) {
      const list = byChannel.get(r.channel) ?? [];
      list.push(r);
      byChannel.set(r.channel, list);
    }

    return [...byChannel.entries()].map(([channel, records]) => {
      const sent = records.length;
      const delivered = records.filter((r) => r.status === "delivered" || r.status === "opened" || r.status === "replied").length;
      const opened = records.filter((r) => r.status === "opened" || r.status === "replied").length;
      const replied = records.filter((r) => r.status === "replied").length;
      const failed = records.filter((r) => r.status === "failed").length;
      const totalCostUsd = records.reduce((s, r) => s + r.costUsd, 0);
      const avgLatencyMs =
        sent > 0 ? records.reduce((s, r) => s + r.latencyMs, 0) / sent : 0;

      return {
        channel,
        sent,
        delivered,
        opened,
        replied,
        failed,
        totalCostUsd,
        avgLatencyMs,
        deliveryRate: sent > 0 ? delivered / sent : 0,
        openRate: sent > 0 ? opened / sent : 0,
        replyRate: sent > 0 ? replied / sent : 0,
      };
    });
  }

  /** Cost breakdown by channel */
  costByChannel(since?: Date): Record<string, number> {
    return Object.fromEntries(
      this.channelStats(since).map((s) => [s.channel, s.totalCostUsd])
    );
  }

  /** Total spend */
  totalCost(since?: Date): number {
    return this.channelStats(since).reduce((s, c) => s + c.totalCostUsd, 0);
  }

  /** Raw records — for piping into external dashboards */
  raw(since?: Date): SendMetric[] {
    const cutoff = since?.getTime() ?? 0;
    return this.#records.filter(
      (r) => new Date(r.timestamp).getTime() >= cutoff
    );
  }
}

export const globalMetrics = new MetricsCollector();
