import { describe, it, expect } from "vitest";
import type { Contact } from "../types.js";
import {
  CompositeScorer,
  EngagementScoringStrategy,
  CostScoringStrategy,
  rankChannels,
} from "../routing/scorer.js";

const contact: Contact = {
  id: "c1",
  phone: "+15555550100",
  email: "test@example.com",
  locale: "en-US",
  timezone: "America/New_York",
  channels: [
    {
      channel: "sms",
      available: true,
      deliveryRate: 0.95,
      openRate: 0.3,
      replyRate: 0.05,
    },
    {
      channel: "whatsapp",
      available: true,
      deliveryRate: 0.99,
      openRate: 0.7,
      replyRate: 0.4,
    },
    {
      channel: "email",
      available: true,
      deliveryRate: 0.9,
      openRate: 0.25,
      replyRate: 0.02,
    },
  ],
  optIns: [
    { channel: "sms", category: "transactional", optedIn: true, updatedAt: "", source: "explicit" },
    { channel: "whatsapp", category: "transactional", optedIn: true, updatedAt: "", source: "explicit" },
    { channel: "email", category: "transactional", optedIn: true, updatedAt: "", source: "explicit" },
  ],
  metadata: {},
};

describe("routing scorer", () => {
  it("ranks whatsapp above sms given higher engagement", () => {
    const scorer = CompositeScorer.default();
    const ranked = rankChannels(contact, "transactional", scorer);
    expect(ranked[0]?.channel).toBe("whatsapp");
  });

  it("scores 0 for unavailable channels", () => {
    const strategy = new EngagementScoringStrategy();
    const score = strategy.score(
      {
        ...contact,
        channels: [{ channel: "sms", available: false, deliveryRate: 1, openRate: 1, replyRate: 1 }],
      },
      "sms",
      "transactional"
    );
    expect(score).toBe(0);
  });

  it("cost strategy returns non-zero scores", () => {
    const strategy = new CostScoringStrategy();
    expect(strategy.score(contact, "push_fcm", "transactional")).toBeGreaterThan(0);
    expect(strategy.score(contact, "sms", "transactional")).toBeLessThan(
      strategy.score(contact, "push_fcm", "transactional")
    );
  });
});
