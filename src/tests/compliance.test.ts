import { describe, it, expect } from "vitest";
import type { Contact } from "../types.js";
import { checkCompliance, detectOptKeyword } from "../compliance/index.js";

const baseContact: Contact = {
  id: "c1",
  phone: "+15555550100",
  locale: "en-US",
  timezone: "America/New_York",
  channels: [{ channel: "sms", available: true, deliveryRate: 1, openRate: 1, replyRate: 1 }],
  optIns: [
    { channel: "sms", category: "transactional", optedIn: true, updatedAt: "", source: "explicit" },
  ],
  metadata: {},
};

describe("compliance", () => {
  it("allows transactional SMS for opted-in contact", () => {
    const result = checkCompliance(baseContact, "sms", "transactional");
    expect(result.allowed).toBe(true);
  });

  it("blocks marketing SMS without opt-in", () => {
    const result = checkCompliance(baseContact, "sms", "marketing");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/opted in/i);
  });

  it("allows marketing SMS with opt-in", () => {
    const contact: Contact = {
      ...baseContact,
      optIns: [
        ...baseContact.optIns,
        { channel: "sms", category: "marketing", optedIn: true, updatedAt: "", source: "explicit" },
      ],
    };
    const result = checkCompliance(contact, "sms", "marketing");
    expect(result.allowed).toBe(true);
  });
});

describe("opt keyword detection", () => {
  it("detects STOP as opt-out", () => {
    expect(detectOptKeyword("STOP")).toBe("opt_out");
  });

  it("detects START as opt-in", () => {
    expect(detectOptKeyword("START")).toBe("opt_in");
  });

  it("returns null for non-keyword messages", () => {
    expect(detectOptKeyword("What time does it open?")).toBeNull();
  });
});
