import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../events/bus.js";
import type { WebhookEvent } from "../types.js";

function makeEvent(overrides?: Partial<WebhookEvent>): WebhookEvent {
  return {
    type: "delivery",
    messageId: "msg-1",
    channel: "sms",
    provider: "twilio",
    occurredAt: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

describe("EventBus", () => {
  it("calls handler when matching event is emitted", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("delivery", handler);
    await bus.emit(makeEvent({ type: "delivery" }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("wildcard handler receives all events", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("*", handler);
    await bus.emit(makeEvent({ type: "delivery" }));
    await bus.emit(makeEvent({ type: "open" }));
    await bus.emit(makeEvent({ type: "reply" }));
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("specific handler only receives matching event type", async () => {
    const bus = new EventBus();
    const deliveryHandler = vi.fn();
    const openHandler = vi.fn();
    bus.on("delivery", deliveryHandler);
    bus.on("open", openHandler);
    await bus.emit(makeEvent({ type: "delivery" }));
    expect(deliveryHandler).toHaveBeenCalledOnce();
    expect(openHandler).not.toHaveBeenCalled();
  });

  it("off removes handler", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("delivery", handler);
    bus.off("delivery", handler);
    await bus.emit(makeEvent({ type: "delivery" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("multiple handlers on same event all fire", async () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("opt_out", h1);
    bus.on("opt_out", h2);
    await bus.emit(makeEvent({ type: "opt_out" }));
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("async handlers are awaited", async () => {
    const bus = new EventBus();
    const results: string[] = [];
    bus.on("delivery", async () => {
      await new Promise((r) => setTimeout(r, 10));
      results.push("done");
    });
    await bus.emit(makeEvent());
    expect(results).toEqual(["done"]);
  });
});
