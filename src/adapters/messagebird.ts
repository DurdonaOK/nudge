import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  RenderedContent,
  WebhookEvent,
} from "../types.js";

export interface MessageBirdConfig {
  apiKey: string;
  originator: string; // sender name or number
  whatsappChannelId?: string;
}

export class MessageBirdAdapter implements ProviderAdapter {
  readonly name = "messagebird";
  readonly capabilities: ProviderCapabilities = {
    channels: ["sms", "whatsapp"],
    supportsDeliveryReceipts: true,
    supportsReadReceipts: false,
    supportsRichContent: false,
  };

  #config: MessageBirdConfig;
  #baseUrl = "https://rest.messagebird.com";

  constructor(config: MessageBirdConfig) {
    this.#config = config;
  }

  async send(payload: RenderedContent): Promise<ProviderSendResult> {
    if (payload.channel !== "sms" && payload.channel !== "whatsapp") {
      throw new Error(`MessageBirdAdapter does not support channel: ${payload.channel}`);
    }

    if (payload.channel === "whatsapp") {
      return this.#sendWhatsApp(payload);
    }
    return this.#sendSms(payload);
  }

  async #sendSms(payload: RenderedContent & { channel: "sms" }): Promise<ProviderSendResult> {
    const res = await fetch(`${this.#baseUrl}/messages`, {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${this.#config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        originator: this.#config.originator,
        recipients: [payload.to],
        body: payload.body,
      }),
    });

    if (!res.ok) throw new Error(`MessageBird SMS error ${res.status}`);
    const data = (await res.json()) as { id: string };
    return { providerMessageId: data.id, status: "sent", rawResponse: data };
  }

  async #sendWhatsApp(payload: RenderedContent & { channel: "whatsapp" }): Promise<ProviderSendResult> {
    if (!this.#config.whatsappChannelId) {
      throw new Error("MessageBird whatsappChannelId required for WhatsApp sends");
    }

    const res = await fetch(`${this.#baseUrl}/conversations/start`, {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${this.#config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId: this.#config.whatsappChannelId,
        to: payload.to,
        type: "text",
        content: { text: payload.body },
      }),
    });

    if (!res.ok) throw new Error(`MessageBird WhatsApp error ${res.status}`);
    const data = (await res.json()) as { id: string };
    return { providerMessageId: data.id, status: "sent", rawResponse: data };
  }

  parseWebhook(body: unknown, _headers: Record<string, string>): WebhookEvent {
    const b = body as Record<string, unknown>;
    return {
      type: (b["status"] as string) === "delivered" ? "delivery" : "failed",
      messageId: (b["id"] as string) ?? "",
      channel: "sms",
      provider: this.name,
      occurredAt: (b["createdDatetime"] as string) ?? new Date().toISOString(),
      payload: body,
    };
  }

  async estimateCost(_payload: RenderedContent): Promise<number> {
    return 0.006;
  }
}
