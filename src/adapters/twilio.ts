import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  RenderedContent,
  WebhookEvent,
} from "../types.js";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Default from number (E.164) */
  fromPhone: string;
  /** WhatsApp sender, e.g. "whatsapp:+14155238886" */
  fromWhatsApp?: string;
  messagingServiceSid?: string;
}

export class TwilioAdapter implements ProviderAdapter {
  readonly name = "twilio";
  readonly capabilities: ProviderCapabilities = {
    channels: ["sms", "whatsapp", "rcs"],
    supportsDeliveryReceipts: true,
    supportsReadReceipts: false,
    supportsRichContent: true,
  };

  #config: TwilioConfig;
  #baseUrl = "https://api.twilio.com/2010-04-01";

  constructor(config: TwilioConfig) {
    this.#config = config;
  }

  async send(payload: RenderedContent): Promise<ProviderSendResult> {
    if (
      payload.channel !== "sms" &&
      payload.channel !== "whatsapp" &&
      payload.channel !== "rcs"
    ) {
      throw new Error(`TwilioAdapter does not support channel: ${payload.channel}`);
    }

    const body = this.#buildBody(payload);
    const url = `${this.#baseUrl}/Accounts/${this.#config.accountSid}/Messages.json`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${this.#config.accountSid}:${this.#config.authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Twilio error ${res.status}: ${JSON.stringify(err)}`);
    }

    const data = (await res.json()) as { sid: string; status: string; price?: string };
    return {
      providerMessageId: data.sid,
      status: "sent",
      costUsd: data.price ? Math.abs(parseFloat(data.price)) : undefined,
      rawResponse: data,
    };
  }

  parseWebhook(body: unknown, _headers: Record<string, string>): WebhookEvent {
    const b = body as Record<string, string>;
    return {
      type: b["MessageStatus"] === "delivered" ? "delivery" : "failed",
      messageId: b["MessageSid"] ?? "",
      channel: b["From"]?.startsWith("whatsapp:") ? "whatsapp" : "sms",
      provider: this.name,
      occurredAt: new Date().toISOString(),
      payload: body,
    };
  }

  async estimateCost(payload: RenderedContent): Promise<number> {
    if (payload.channel === "sms") {
      const segments = (payload as { segments?: number }).segments ?? 1;
      return segments * 0.0079;
    }
    if (payload.channel === "whatsapp") return 0.005;
    return 0.01;
  }

  #buildBody(payload: RenderedContent): Record<string, string> {
    if (payload.channel === "sms") {
      return {
        To: payload.to,
        From: this.#config.messagingServiceSid
          ? ""
          : this.#config.fromPhone,
        ...(this.#config.messagingServiceSid
          ? { MessagingServiceSid: this.#config.messagingServiceSid }
          : {}),
        Body: payload.body,
      };
    }
    if (payload.channel === "whatsapp") {
      return {
        To: `whatsapp:${payload.to}`,
        From: this.#config.fromWhatsApp ?? `whatsapp:${this.#config.fromPhone}`,
        Body: payload.body,
      };
    }
    // RCS via Twilio (alpha)
    return {
      To: payload.to,
      From: this.#config.fromPhone,
      Body: payload.body,
    };
  }
}
