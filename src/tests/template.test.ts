import { describe, it, expect } from "vitest";
import type { Contact, Template } from "../types.js";
import { render, canDegradeTo } from "../templates/engine.js";

const contact: Contact = {
  id: "c1",
  phone: "+15555550100",
  email: "hello@example.com",
  fcmToken: "fcm-token-abc",
  inAppUserId: "user-123",
  locale: "en-US",
  timezone: "America/New_York",
  channels: [],
  optIns: [],
  metadata: {},
};

const template: Template = {
  id: "welcome",
  body: "Hello {{name}}, welcome to {{product}}!",
  subject: "Welcome to {{product}}",
  category: "transactional",
};

describe("template engine", () => {
  it("renders SMS with stripped markdown and segment count", async () => {
    const payload = await render(template, { name: "Alice", product: "Nudge" }, "sms", contact);
    expect(payload.channel).toBe("sms");
    if (payload.channel === "sms") {
      expect(payload.body).toBe("Hello Alice, welcome to Nudge!");
      expect(payload.segments).toBe(1);
    }
  });

  it("renders WhatsApp with correct type", async () => {
    const payload = await render(template, { name: "Alice", product: "Nudge" }, "whatsapp", contact);
    expect(payload.channel).toBe("whatsapp");
    if (payload.channel === "whatsapp") {
      expect(payload.body).toContain("Alice");
    }
  });

  it("renders push_fcm with title from subject", async () => {
    const payload = await render(template, { name: "Alice", product: "Nudge" }, "push_fcm", contact);
    expect(payload.channel).toBe("push_fcm");
    if (payload.channel === "push_fcm") {
      expect(payload.title).toContain("Nudge");
    }
  });

  it("canDegradeTo returns false for SMS when template has suggestedReplies", () => {
    const richTemplate: Template = {
      ...template,
      suggestedReplies: ["Yes", "No"],
    };
    expect(canDegradeTo(richTemplate, "sms")).toBe(false);
    expect(canDegradeTo(richTemplate, "rcs")).toBe(true);
  });
});
