import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  RenderedContent,
  WebhookEvent,
} from "../types.js";

export interface TextbeltConfig {
  /** Use "textbelt" for 1 free SMS/day, or a paid API key from textbelt.com */
  apiKey?: string;
}

export class TextbeltAdapter implements ProviderAdapter {
  readonly name = "textbelt";
  readonly capabilities: ProviderCapabilities = {
    channels: ["sms"],
    supportsDeliveryReceipts: false,
    supportsReadReceipts: false,
    supportsRichContent: false,
  };

  #apiKey: string;

  constructor(config?: TextbeltConfig) {
    this.#apiKey = config?.apiKey ?? "textbelt";
  }

  async send(payload: RenderedContent): Promise<ProviderSendResult> {
    if (payload.channel !== "sms") {
      throw new Error(`TextbeltAdapter does not support channel: ${payload.channel}`);
    }

    const res = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: payload.to,
        message: payload.body,
        key: this.#apiKey,
      }),
    });

    const data = (await res.json()) as { success: boolean; textId?: string; error?: string; quotaRemaining?: number };

    if (!data.success) {
      throw new Error(`Textbelt error: ${data.error ?? "unknown"}`);
    }

    return {
      providerMessageId: data.textId ?? "",
      status: "sent",
      costUsd: 0,
      rawResponse: data,
    };
  }

  parseWebhook(body: unknown, _headers: Record<string, string>): WebhookEvent {
    return {
      type: "delivery",
      messageId: "",
      channel: "sms",
      provider: this.name,
      occurredAt: new Date().toISOString(),
      payload: body,
    };
  }

  async estimateCost(_payload: RenderedContent): Promise<number> {
    return 0;
  }
}
