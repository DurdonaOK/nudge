import { describe, it, expect, vi } from "vitest";
import { createWebhookServer } from "../webhook/server.js";
import { AdapterRegistry } from "../adapters/registry.js";
import { EventBus } from "../events/bus.js";
import { TwilioAdapter } from "../adapters/twilio.js";

function makeServer(port: number) {
  const registry = new AdapterRegistry();
  registry.register(
    new TwilioAdapter({
      accountSid: "ACtest",
      authToken: "token",
      fromPhone: "+15005550006",
    })
  );
  const bus = new EventBus();
  return { server: createWebhookServer({ port, registry, bus }), bus };
}

async function post(port: number, path: string, body: unknown) {
  return fetch(`http://localhost:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("webhook server", () => {
  it("GET /health returns 200", async () => {
    const { server } = makeServer(13101);
    await server.start();
    const res = await fetch("http://localhost:13101/health");
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    await server.stop();
  });

  it("POST /webhooks/twilio parses a delivery event and emits on bus", async () => {
    const { server, bus } = makeServer(13102);
    const handler = vi.fn();
    bus.on("delivery", handler);

    await server.start();
    const res = await post(13102, "/webhooks/twilio", {
      MessageSid: "SM123",
      MessageStatus: "delivered",
      From: "+15005550006",
      To: "+15555550100",
    });
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0]?.[0];
    expect(event.type).toBe("delivery");
    expect(event.provider).toBe("twilio");
    await server.stop();
  });

  it("POST /webhooks/unknown returns 404", async () => {
    const { server } = makeServer(13103);
    await server.start();
    const res = await post(13103, "/webhooks/nonexistent", {});
    expect(res.status).toBe(404);
    await server.stop();
  });

  it("POST /webhooks/twilio with invalid JSON returns 400", async () => {
    const { server } = makeServer(13104);
    await server.start();
    const res = await fetch("http://localhost:13104/webhooks/twilio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    await server.stop();
  });

  it("opt-out keyword on inbound reply emits opt_out event", async () => {
    const { server, bus } = makeServer(13105);
    const handler = vi.fn();
    bus.on("opt_out", handler);

    await server.start();
    await post(13105, "/webhooks/twilio", {
      MessageSid: "SM999",
      MessageStatus: "received",
      From: "+15555550100",
      To: "+15005550006",
      Body: "STOP",
    });
    expect(handler).toHaveBeenCalledOnce();
    await server.stop();
  });
});
