import type { Channel, ComplianceCheck, Contact, MessageCategory } from "../types.js";
import { isOptedIn } from "../contacts/store.js";
import { isInQuietHours, nextOptimalSendTime } from "../routing/optimizer.js";

// ---------------------------------------------------------------------------
// Region-specific rules (stub — expand per-country as needed)
// ---------------------------------------------------------------------------

interface RegionRule {
  /** Marketing requires explicit opt-in */
  requiresExplicitOptIn: boolean;
  /** Transactional allowed without prior opt-in */
  transactionalExempt: boolean;
}

const REGION_RULES: Record<string, RegionRule> = {
  EU: { requiresExplicitOptIn: true, transactionalExempt: true },
  US: { requiresExplicitOptIn: false, transactionalExempt: true },
  CA: { requiresExplicitOptIn: true, transactionalExempt: true },
  default: { requiresExplicitOptIn: false, transactionalExempt: true },
};

function regionForLocale(locale: string): string {
  const country = locale.split("-")[1]?.toUpperCase();
  const eu = [
    "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR",
    "HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
  ];
  if (country && eu.includes(country)) return "EU";
  if (country === "CA") return "CA";
  if (country === "US") return "US";
  return "default";
}

// ---------------------------------------------------------------------------
// Compliance check
// ---------------------------------------------------------------------------

export function checkCompliance(
  contact: Contact,
  channel: Channel,
  category: MessageCategory
): ComplianceCheck {
  const region = regionForLocale(contact.locale);
  const rules = REGION_RULES[region] ?? REGION_RULES["default"]!;

  // Opt-in enforcement
  if (category === "marketing" || rules.requiresExplicitOptIn) {
    if (!isOptedIn(contact, channel, category)) {
      return {
        allowed: false,
        reason: `Contact has not opted in to ${category} messages on ${channel}`,
      };
    }
  }

  // Transactional exempt from opt-in in most regions
  if (category === "transactional" && rules.transactionalExempt) {
    // Still check quiet hours
  }

  // Quiet hours
  if (isInQuietHours(contact)) {
    const retryAt = nextOptimalSendTime(contact);
    return {
      allowed: false,
      reason: "Contact is in quiet hours",
      retryAfter: retryAt.toISOString(),
    };
  }

  // Channel-specific: 10DLC for SMS in US
  if (channel === "sms" && region === "US") {
    if (!process.env["NUDGE_10DLC_REGISTERED"]) {
      console.warn(
        "[nudge] NUDGE_10DLC_REGISTERED not set — ensure 10DLC registration before sending SMS in US"
      );
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Opt-out keyword detection (for inbound SMS/WhatsApp)
// ---------------------------------------------------------------------------

const OPT_OUT_KEYWORDS = new Set([
  "stop", "stopall", "unsubscribe", "cancel", "end", "quit",
]);
const OPT_IN_KEYWORDS = new Set(["start", "yes", "unstop"]);

export function detectOptKeyword(
  text: string
): "opt_out" | "opt_in" | null {
  const normalized = text.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (OPT_OUT_KEYWORDS.has(normalized)) return "opt_out";
  if (OPT_IN_KEYWORDS.has(normalized)) return "opt_in";
  return null;
}
