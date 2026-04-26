import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  RenderedContent,
  WebhookEvent,
} from "../types.js";

export interface VonageConfig {
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
  whatsappNumber?: string;
}

export class VonageAdapter implements ProviderAdapter {
  readonly name = "vonage";
  readonly capabilities: ProviderCapabilities = {
    channels: ["sms", "whatsapp"],
    supportsDeliveryReceipts: true,
    supportsReadReceipts: false,
    supportsRichContent: false,
  };

  #config: VonageConfig;

  constructor(config: VonageConfig) {
    this.#config = config;
  }

  async send(payload: RenderedContent): Promise<ProviderSendResult> {
    if (payload.channel !== "sms" && payload.channel !== "whatsapp") {
      throw new Error(`VonageAdapter does not support channel: ${payload.channel}`);
    }

    const url =
      payload.channel === "whatsapp"
        ? "https://messages-sandbox.nexmo.com/v1/messages"
        : "https://rest.nexmo.com/sms/json";

    let body: Record<string, unknown>;
    if (payload.channel === "sms") {
      body = {
        api_key: this.#config.apiKey,
        api_secret: this.#config.apiSecret,
        to: payload.to,
        from: this.#config.fromNumber,
        text: payload.body,
      };
    } else {
      body = {
        from: { type: "whatsapp", number: this.#config.whatsappNumber },
        to: { type: "whatsapp", number: payload.to },
        message: { content: { type: "text", text: payload.body } },
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(payload.channel === "whatsapp"
          ? {
              Authorization: `Basic ${btoa(`${this.#config.apiKey}:${this.#config.apiSecret}`)}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Vonage error ${res.status}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const messageId =
      (data["message-id"] as string) ??
      ((data["messages"] as Array<Record<string, string>>)?.[0]?.["message-id"] ?? "");

    return {
      providerMessageId: messageId,
      status: "sent",
      rawResponse: data,
    };
  }

  parseWebhook(body: unknown, _headers: Record<string, string>): WebhookEvent {
    const b = body as Record<string, string>;
    const status = b["status"] ?? "";
    const type =
      status === "delivered"                       ? "delivery" :
      status === "received" || b["text"] != null   ? "reply"    :
      status === "failed" || status === "expired"  ? "failed"   :
      "delivery";
    return {
      type,
      messageId: b["messageId"] ?? b["message-id"] ?? b["msisdn"] ?? "",
      channel: "sms",
      provider: this.name,
      occurredAt: b["timestamp"] ?? new Date().toISOString(),
      payload: body,
    };
  }

  async estimateCost(payload: RenderedContent): Promise<number> {
    return payload.channel === "whatsapp" ? 0.005 : 0.0065;
  }
}
