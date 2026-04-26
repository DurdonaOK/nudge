import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  RenderedContent,
  WebhookEvent,
} from "../types.js";

export interface ResendConfig {
  apiKey: string;
  /** Verified sender address, e.g. "Nudge <hello@yourdomain.com>" or just "hello@yourdomain.com" */
  from: string;
}

export class ResendAdapter implements ProviderAdapter {
  readonly name = "resend";
  readonly capabilities: ProviderCapabilities = {
    channels: ["email"],
    supportsDeliveryReceipts: false,
    supportsReadReceipts: false,
    supportsRichContent: true,
  };

  #config: ResendConfig;

  constructor(config: ResendConfig) {
    this.#config = config;
  }

  async send(payload: RenderedContent): Promise<ProviderSendResult> {
    if (payload.channel !== "email") {
      throw new Error(`ResendAdapter does not support channel: ${payload.channel}`);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.#config.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Resend error ${res.status}: ${JSON.stringify(err)}`);
    }

    const data = (await res.json()) as { id: string };
    return {
      providerMessageId: data.id,
      status: "sent",
      costUsd: 0.0001,
      rawResponse: data,
    };
  }

  parseWebhook(body: unknown, _headers: Record<string, string>): WebhookEvent {
    const b = body as Record<string, unknown>;
    const type = b["type"] as string;
    return {
      type: type === "email.delivered" ? "delivery" : type === "email.opened" ? "open" : "failed",
      messageId: (b["data"] as Record<string, string>)?.["email_id"] ?? "",
      channel: "email",
      provider: this.name,
      occurredAt: new Date().toISOString(),
      payload: body,
    };
  }

  async estimateCost(_payload: RenderedContent): Promise<number> {
    return 0.0001;
  }
}
