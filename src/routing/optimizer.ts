import type { Contact } from "../types.js";

/** Returns the optimal send hour (0-23) in the contact's local timezone */
export function optimalSendHour(contact: Contact): number {
  // Engagement data would typically come from historical sends.
  // Default heuristic: 10am in recipient's timezone (high open-rate window).
  return 10;
}

/**
 * Returns a Date representing the next occurrence of `hourInLocal` in
 * the contact's timezone, or now if we're within 15 minutes of it.
 */
export function nextOptimalSendTime(contact: Contact): Date {
  const hour = optimalSendHour(contact);

  // Use Intl to figure out the contact's current local time
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

  const minutesUntilOptimal =
    (hour - localHour) * 60 - localMinute + (hour <= localHour ? 24 * 60 : 0);

  if (minutesUntilOptimal <= 15) return now;

  const target = new Date(now.getTime() + minutesUntilOptimal * 60_000);
  return target;
}

/** True if now is inside the contact's quiet hours */
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
  // Wraps midnight (e.g. 22–7)
  return localHour >= startHour || localHour < endHour;
}
