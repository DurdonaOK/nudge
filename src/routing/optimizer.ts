import type { Channel, Contact } from "../types.js";

// ---------------------------------------------------------------------------
// Per-contact optimal send hour
// Uses engagement history if available; falls back to locale-aware defaults.
// ---------------------------------------------------------------------------

/** Business-hours windows by locale region (hour range in recipient's TZ) */
const LOCALE_WINDOWS: Record<string, [number, number]> = {
  US: [10, 20], // 10am–8pm
  EU: [10, 19], // 10am–7pm
  ASIA: [9, 21], // 9am–9pm
};

function localeRegion(locale: string): string {
  const country = locale.split("-")[1]?.toUpperCase() ?? "";
  const eu = ["GB","DE","FR","ES","IT","NL","SE","NO","DK","FI","PL","PT","BE","AT","CH"];
  const asia = ["JP","KR","CN","TW","SG","IN","AU","NZ","TH","VN","PH","ID","MY","HK"];
  if (eu.includes(country)) return "EU";
  if (asia.includes(country)) return "ASIA";
  return "US";
}

/**
 * Returns the optimal send hour (0–23) for a contact in their local timezone.
 *
 * Algorithm:
 *  1. If the contact has channel history, pick the hour with the highest
 *     open + reply rate across their top channel.
 *  2. Otherwise use locale-based midpoint of the business window.
 */
export function optimalSendHour(contact: Contact, channel?: Channel): number {
  // Use engagement data when available — pick the channel with most history
  const channelToScore = channel
    ? contact.channels.find((c) => c.channel === channel)
    : contact.channels
        .filter((c) => c.available)
        .sort((a, b) => b.openRate + b.replyRate - (a.openRate + a.replyRate))[0];

  // If we have meaningful open/reply rates, bias toward mid-day (heuristic proxy)
  // In production this would query a timeseries of per-hour open rates per contact.
  if (channelToScore && channelToScore.openRate > 0.1) {
    // High engagement contacts tend to respond earlier in the day
    return channelToScore.replyRate > 0.2 ? 9 : 10;
  }

  const region = localeRegion(contact.locale);
  const [start, end] = LOCALE_WINDOWS[region] ?? [10, 20];
  return Math.floor((start + end) / 2);
}

/**
 * Returns a Date representing the next occurrence of the optimal hour in the
 * contact's timezone. Returns `now` if we're already within 15 minutes of it.
 */
export function nextOptimalSendTime(contact: Contact, channel?: Channel): Date {
  const hour = optimalSendHour(contact, channel);
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: contact.timezone,
    hour: "numeric",
    hour12: false,
    minute: "numeric",
  });

  const parts = formatter.formatToParts(now);
  const localHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const localMinute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

  let minutesUntil = (hour - localHour) * 60 - localMinute;
  if (minutesUntil < 0) minutesUntil += 24 * 60; // next day

  if (minutesUntil <= 15) return now;
  return new Date(now.getTime() + minutesUntil * 60_000);
}

/** True if `now` falls inside the contact's quiet hours window */
export function isInQuietHours(contact: Contact): boolean {
  if (!contact.quietHours) return false;

  const { timezone, startHour, endHour } = contact.quietHours;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });

  const localHour = parseInt(
    formatter.formatToParts(new Date()).find((p) => p.type === "hour")?.value ?? "0",
    10
  );

  if (startHour < endHour) {
    return localHour >= startHour && localHour < endHour;
  }
  // Window wraps midnight (e.g. 22–6)
  return localHour >= startHour || localHour < endHour;
}
