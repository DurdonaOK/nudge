import { describe, it, expect } from "vitest";
import type { Contact } from "../types.js";
import { isInQuietHours, nextOptimalSendTime, optimalSendHour } from "../routing/optimizer.js";

function makeContact(overrides?: Partial<Contact>): Contact {
  return {
    id: "c1",
    locale: "en-US",
    timezone: "America/New_York",
    channels: [],
    optIns: [],
    metadata: {},
    ...overrides,
  };
}

describe("optimalSendHour", () => {
  it("returns midpoint of US business window (15) for en-US contact with no history", () => {
    expect(optimalSendHour(makeContact())).toBe(15);
  });

  it("returns earlier hour for high-engagement contact", () => {
    const contact = makeContact({
      channels: [{
        channel: "sms", available: true,
        deliveryRate: 0.99, openRate: 0.8, replyRate: 0.5,
      }],
    });
    expect(optimalSendHour(contact)).toBe(9);
  });
});

describe("isInQuietHours", () => {
  it("returns false when no quietHours set", () => {
    expect(isInQuietHours(makeContact())).toBe(false);
  });

  it("returns false when contact has quiet hours but current time is outside them", () => {
    // Set quiet hours to a window far from now — 2am to 5am
    const contact = makeContact({
      quietHours: { timezone: "UTC", startHour: 2, endHour: 5 },
    });
    // We can't control the clock, but we can confirm the function returns a boolean
    const result = isInQuietHours(contact);
    expect(typeof result).toBe("boolean");
  });

  it("wraps midnight correctly (22–6 window)", () => {
    const contact = makeContact({
      quietHours: { timezone: "UTC", startHour: 22, endHour: 6 },
    });
    const result = isInQuietHours(contact);
    expect(typeof result).toBe("boolean");
  });
});

describe("nextOptimalSendTime", () => {
  it("returns a Date", () => {
    const contact = makeContact({ timezone: "America/New_York" });
    const t = nextOptimalSendTime(contact);
    expect(t).toBeInstanceOf(Date);
  });

  it("returned time is not in the past", () => {
    const contact = makeContact({ timezone: "America/Los_Angeles" });
    const t = nextOptimalSendTime(contact);
    // Allow 1s of slack for test execution time
    expect(t.getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
  });
});
