import { describe, it, expect } from "vitest";
import type { Contact, RcsPayload, Template } from "../types.js";
import { render, canDegradeTo } from "../templates/engine.js";

const contact: Contact = {
  id: "c1",
  phone: "+15555550100",
  locale: "en-US",
  timezone: "America/New_York",
  channels: [],
  optIns: [],
  metadata: {},
};

async function rcs(template: Template, vars = {}): Promise<RcsPayload> {
  const p = await render(template, vars, "rcs", contact);
  if (p.channel !== "rcs") throw new Error("expected rcs");
  return p;
}

// ---------------------------------------------------------------------------
// Text-only (no card)
// ---------------------------------------------------------------------------

describe("RCS — text only", () => {
  it("plain body with no media/actions renders as text-only", async () => {
    const p = await rcs({
      id: "t1", body: "Hello world", category: "transactional",
    });
    expect(p.richCard).toBeUndefined();
    expect(p.carousel).toBeUndefined();
    expect(p.fallbackText).toBe("Hello world");
  });
});

// ---------------------------------------------------------------------------
// Rich card — auto-extracted from markdown
// ---------------------------------------------------------------------------

describe("RCS — rich card from markdown", () => {
  it("extracts title from H1 heading", async () => {
    const p = await rcs({
      id: "t1",
      body: "# Your Order Shipped\n\nYour package is on its way.",
      mediaUrl: "https://cdn.example.com/box.png",
      category: "transactional",
    });
    expect(p.richCard?.title).toBe("Your Order Shipped");
    expect(p.richCard?.description).toContain("on its way");
  });

  it("extracts open_url action from markdown link", async () => {
    const p = await rcs({
      id: "t1",
      body: "# Shipped!\n\n[Track your order](https://example.com/track/123)",
      mediaUrl: "https://cdn.example.com/truck.png",
      category: "transactional",
    });
    const urlAction = p.richCard?.actions?.find((a) => a.type === "open_url");
    expect(urlAction?.label).toBe("Track your order");
    expect(urlAction?.url).toBe("https://example.com/track/123");
  });

  it("extracts dial action from tel: link", async () => {
    const p = await rcs({
      id: "t1",
      body: "# Need help?\n\n[Call support](tel:+18005551234)",
      mediaUrl: "https://cdn.example.com/support.png",
      category: "transactional",
    });
    const dialAction = p.richCard?.actions?.find((a) => a.type === "dial");
    expect(dialAction?.phone).toBe("+18005551234");
    expect(dialAction?.label).toBe("Call support");
  });

  it("sets mediaHeight to MEDIUM by default", async () => {
    const p = await rcs({
      id: "t1",
      body: "# Hi\n\nSome text",
      mediaUrl: "https://cdn.example.com/img.png",
      category: "transactional",
    });
    expect(p.richCard?.mediaHeight).toBe("MEDIUM");
  });

  it("respects explicit mediaHeight override", async () => {
    const p = await rcs({
      id: "t1",
      body: "# Hi\n\nSome text",
      richCard: { mediaUrl: "https://cdn.example.com/img.png", mediaHeight: "TALL" },
      category: "transactional",
    });
    expect(p.richCard?.mediaHeight).toBe("TALL");
  });

  it("merges explicit richCard actions with extracted markdown actions", async () => {
    const p = await rcs({
      id: "t1",
      body: "# Offer\n\n[Learn more](https://example.com)",
      richCard: {
        mediaUrl: "https://cdn.example.com/sale.png",
        actions: [{ type: "reply", label: "Claim offer", reply: "CLAIM" }],
      },
      category: "marketing",
    });
    const labels = p.richCard?.actions?.map((a) => a.label) ?? [];
    expect(labels).toContain("Claim offer");
    expect(labels).toContain("Learn more");
  });
});

// ---------------------------------------------------------------------------
// Rich card — explicit config (no markdown parsing needed)
// ---------------------------------------------------------------------------

describe("RCS — explicit richCard config", () => {
  it("renders standalone card with all fields", async () => {
    const p = await rcs({
      id: "t1",
      body: "Check this out",
      richCard: {
        mediaUrl: "https://cdn.example.com/hero.jpg",
        mediaHeight: "TALL",
        orientation: "HORIZONTAL",
        actions: [
          { type: "open_url", label: "Shop now", url: "https://shop.example.com" },
          { type: "reply", label: "Remind me later", reply: "REMIND" },
        ],
      },
      category: "marketing",
    });
    expect(p.richCard?.orientation).toBe("HORIZONTAL");
    expect(p.richCard?.mediaHeight).toBe("TALL");
    expect(p.richCard?.actions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Suggested replies
// ---------------------------------------------------------------------------

describe("RCS — suggested replies", () => {
  it("converts string labels to reply actions", async () => {
    const p = await rcs({
      id: "t1",
      body: "# Survey\n\nHow did we do?",
      mediaUrl: "https://cdn.example.com/star.png",
      suggestedReplies: ["Great!", "Okay", "Not great"],
      category: "transactional",
    });
    expect(p.suggestedReplies).toHaveLength(3);
    expect(p.suggestedReplies?.[0]?.type).toBe("reply");
    expect(p.suggestedReplies?.[0]?.label).toBe("Great!");
    expect(p.suggestedReplies?.[0]?.reply).toBe("Great!");
  });

  it("no suggestedReplies field when none defined", async () => {
    const p = await rcs({
      id: "t1",
      body: "# Hello\n\nSimple message",
      mediaUrl: "https://cdn.example.com/img.png",
      category: "transactional",
    });
    expect(p.suggestedReplies).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Carousel
// ---------------------------------------------------------------------------

describe("RCS — carousel", () => {
  it("renders carousel with multiple cards", async () => {
    const p = await rcs({
      id: "t1",
      body: "Check out our collection",
      carousel: [
        {
          title: "Red Sneakers",
          description: "$89.99",
          mediaUrl: "https://cdn.example.com/red.jpg",
          mediaHeight: "MEDIUM",
          actions: [{ type: "open_url", label: "Buy", url: "https://shop.example.com/red" }],
        },
        {
          title: "Blue Sneakers",
          description: "$79.99",
          mediaUrl: "https://cdn.example.com/blue.jpg",
          mediaHeight: "MEDIUM",
          actions: [{ type: "open_url", label: "Buy", url: "https://shop.example.com/blue" }],
        },
        {
          title: "Green Sneakers",
          description: "$69.99",
          mediaUrl: "https://cdn.example.com/green.jpg",
          mediaHeight: "MEDIUM",
          actions: [{ type: "open_url", label: "Buy", url: "https://shop.example.com/green" }],
        },
      ],
      category: "marketing",
    });
    expect(p.carousel).toHaveLength(3);
    expect(p.richCard).toBeUndefined();
    expect(p.carousel?.[1]?.title).toBe("Blue Sneakers");
    expect(p.carousel?.[2]?.actions?.[0]?.url).toBe("https://shop.example.com/green");
  });

  it("carousel fallbackText is plain body", async () => {
    const p = await rcs({
      id: "t1",
      body: "# Our **top picks** for you",
      carousel: [
        { title: "Item A", description: "Desc A", actions: [] },
        { title: "Item B", description: "Desc B", actions: [] },
      ],
      category: "marketing",
    });
    expect(p.fallbackText).not.toContain("**");
    expect(p.fallbackText).not.toContain("#");
  });
});

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

describe("canDegradeTo with richCard/carousel", () => {
  it("richCard template cannot degrade to SMS", () => {
    const t: Template = {
      id: "t1", body: "x", category: "transactional",
      richCard: { mediaUrl: "https://cdn.example.com/img.png" },
    };
    expect(canDegradeTo(t, "sms")).toBe(false);
    expect(canDegradeTo(t, "whatsapp")).toBe(true);
  });

  it("carousel template cannot degrade to email", () => {
    const t: Template = {
      id: "t1", body: "x", category: "marketing",
      carousel: [{ title: "A", description: "B", actions: [] }],
    };
    expect(canDegradeTo(t, "email")).toBe(false);
    expect(canDegradeTo(t, "rcs")).toBe(true);
  });

  it("plain template can degrade to any channel", () => {
    const t: Template = { id: "t1", body: "x", category: "transactional" };
    expect(canDegradeTo(t, "sms")).toBe(true);
    expect(canDegradeTo(t, "email")).toBe(true);
  });
});
