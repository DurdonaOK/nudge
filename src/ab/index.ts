import type { Contact, Template } from "../types.js";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// A/B experiment definition
// ---------------------------------------------------------------------------

export interface AbVariant {
  name: string;
  /** 0–1 weight; variants are normalized to sum to 1 */
  weight: number;
  template: Template;
}

export interface AbExperiment {
  id: string;
  variants: AbVariant[];
}

// ---------------------------------------------------------------------------
// Deterministic assignment
// Hashes contactId + experimentId so the same contact always gets the same
// variant (sticky assignment), no external state needed.
// ---------------------------------------------------------------------------

export function assignVariant(
  experiment: AbExperiment,
  contact: Contact
): AbVariant {
  if (experiment.variants.length === 0) {
    throw new Error(`Experiment ${experiment.id} has no variants`);
  }

  const hash = createHash("sha256")
    .update(`${experiment.id}:${contact.id}`)
    .digest("hex");

  // Use first 8 hex chars as a 32-bit number, map to [0, 1)
  const bucket = parseInt(hash.slice(0, 8), 16) / 0xffffffff;

  const total = experiment.variants.reduce((s, v) => s + v.weight, 0);
  let cursor = 0;
  for (const variant of experiment.variants) {
    cursor += variant.weight / total;
    if (bucket < cursor) return variant;
  }

  return experiment.variants[experiment.variants.length - 1]!;
}

// ---------------------------------------------------------------------------
// Result tracking (in-memory; replace with persistent store in production)
// ---------------------------------------------------------------------------

export interface AbResult {
  experimentId: string;
  variantName: string;
  contactId: string;
  messageId: string;
  /** ISO 8601 */
  sentAt: string;
  converted?: boolean;
  /** ISO 8601 */
  convertedAt?: string;
}

export class AbTracker {
  #results: AbResult[] = [];

  record(result: Omit<AbResult, "converted" | "convertedAt">): void {
    this.#results.push({ ...result });
  }

  markConverted(messageId: string): void {
    const r = this.#results.find((r) => r.messageId === messageId);
    if (r) {
      r.converted = true;
      r.convertedAt = new Date().toISOString();
    }
  }

  summary(experimentId: string): Record<string, { sent: number; conversions: number; rate: number }> {
    const relevant = this.#results.filter((r) => r.experimentId === experimentId);
    const byVariant: Record<string, { sent: number; conversions: number }> = {};

    for (const r of relevant) {
      const v = (byVariant[r.variantName] ??= { sent: 0, conversions: 0 });
      v.sent++;
      if (r.converted) v.conversions++;
    }

    return Object.fromEntries(
      Object.entries(byVariant).map(([name, stats]) => [
        name,
        { ...stats, rate: stats.sent > 0 ? stats.conversions / stats.sent : 0 },
      ])
    );
  }

  all(): AbResult[] {
    return [...this.#results];
  }
}

export const globalAbTracker = new AbTracker();
