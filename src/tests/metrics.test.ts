import { describe, it, expect } from "vitest";
import { MetricsCollector } from "../metrics/index.js";
import type { SendMetric } from "../metrics/index.js";

function metric(overrides?: Partial<SendMetric>): SendMetric {
  return {
    messageId: crypto.randomUUID(),
    channel: "sms",
    provider: "twilio",
    category: "transactional",
    status: "delivered",
    costUsd: 0.008,
    latencyMs: 320,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("MetricsCollector", () => {
  it("aggregates delivery rate correctly", () => {
    const m = new MetricsCollector();
    m.record(metric({ status: "delivered" }));
    m.record(metric({ status: "delivered" }));
    m.record(metric({ status: "failed" }));

    const stats = m.channelStats();
    const sms = stats.find((s) => s.channel === "sms")!;
    expect(sms.sent).toBe(3);
    expect(sms.delivered).toBe(2);
    expect(sms.failed).toBe(1);
    expect(sms.deliveryRate).toBeCloseTo(2 / 3, 5);
  });

  it("tracks cost per channel", () => {
    const m = new MetricsCollector();
    m.record(metric({ channel: "sms", costUsd: 0.008 }));
    m.record(metric({ channel: "sms", costUsd: 0.008 }));
    m.record(metric({ channel: "email", provider: "ses", costUsd: 0.0001 }));

    const costs = m.costByChannel();
    expect(costs["sms"]).toBeCloseTo(0.016);
    expect(costs["email"]).toBeCloseTo(0.0001);
  });

  it("totalCost sums across channels", () => {
    const m = new MetricsCollector();
    m.record(metric({ costUsd: 0.01 }));
    m.record(metric({ costUsd: 0.02 }));
    expect(m.totalCost()).toBeCloseTo(0.03);
  });

  it("since filter excludes old records", () => {
    const m = new MetricsCollector();
    const old = new Date(Date.now() - 10_000).toISOString();
    m.record(metric({ timestamp: old, costUsd: 0.5 }));
    m.record(metric({ costUsd: 0.01 }));

    const since = new Date(Date.now() - 1000);
    expect(m.totalCost(since)).toBeCloseTo(0.01);
  });

  it("tracks open and reply rates", () => {
    const m = new MetricsCollector();
    m.record(metric({ status: "delivered" }));
    m.record(metric({ status: "opened" }));
    m.record(metric({ status: "replied" }));

    const stats = m.channelStats();
    const sms = stats.find((s) => s.channel === "sms")!;
    expect(sms.openRate).toBeCloseTo(2 / 3, 5); // opened + replied count as opened
    expect(sms.replyRate).toBeCloseTo(1 / 3, 5);
  });

  it("raw() returns all records", () => {
    const m = new MetricsCollector();
    m.record(metric());
    m.record(metric());
    expect(m.raw()).toHaveLength(2);
  });
});
