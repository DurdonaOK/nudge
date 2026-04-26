import { describe, it, expect } from "vitest";
import type { Template } from "../types.js";
import { assignVariant, AbTracker } from "../ab/index.js";
import type { AbExperiment } from "../ab/index.js";

const t = (id: string): Template => ({
  id, body: `Body for ${id}`, category: "marketing",
});

const experiment: AbExperiment = {
  id: "exp-welcome",
  variants: [
    { name: "control", weight: 0.5, template: t("welcome-control") },
    { name: "treatment", weight: 0.5, template: t("welcome-treatment") },
  ],
};

describe("A/B variant assignment", () => {
  it("assigns a variant for a contact", () => {
    const variant = assignVariant(experiment, { id: "c1" } as never);
    expect(["control", "treatment"]).toContain(variant.name);
  });

  it("is deterministic — same contact always gets same variant", () => {
    const contact = { id: "sticky-user-42" } as never;
    const v1 = assignVariant(experiment, contact);
    const v2 = assignVariant(experiment, contact);
    const v3 = assignVariant(experiment, contact);
    expect(v1.name).toBe(v2.name);
    expect(v2.name).toBe(v3.name);
  });

  it("distributes ~50/50 across many contacts", () => {
    const counts: Record<string, number> = { control: 0, treatment: 0 };
    for (let i = 0; i < 1000; i++) {
      const v = assignVariant(experiment, { id: `user-${i}` } as never);
      counts[v.name] = (counts[v.name] ?? 0) + 1;
    }
    // Expect within 10% of 500 each
    expect(counts["control"]!).toBeGreaterThan(450);
    expect(counts["treatment"]!).toBeGreaterThan(450);
  });

  it("different contacts get different variants (not all same)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      seen.add(assignVariant(experiment, { id: `u${i}` } as never).name);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("weighted experiment skews correctly", () => {
    const skewed: AbExperiment = {
      id: "skewed",
      variants: [
        { name: "a", weight: 0.9, template: t("a") },
        { name: "b", weight: 0.1, template: t("b") },
      ],
    };
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) {
      const v = assignVariant(skewed, { id: `u${i}` } as never);
      counts[v.name] = (counts[v.name] ?? 0) + 1;
    }
    expect(counts["a"]!).toBeGreaterThan(counts["b"]!);
    expect(counts["a"]!).toBeGreaterThan(800);
  });
});

describe("AbTracker", () => {
  it("records and summarises results", () => {
    const tracker = new AbTracker();
    tracker.record({ experimentId: "exp-1", variantName: "control", contactId: "c1", messageId: "m1", sentAt: new Date().toISOString() });
    tracker.record({ experimentId: "exp-1", variantName: "treatment", contactId: "c2", messageId: "m2", sentAt: new Date().toISOString() });
    tracker.markConverted("m1");

    const summary = tracker.summary("exp-1");
    expect(summary["control"]?.sent).toBe(1);
    expect(summary["control"]?.conversions).toBe(1);
    expect(summary["control"]?.rate).toBe(1);
    expect(summary["treatment"]?.conversions).toBe(0);
  });
});
