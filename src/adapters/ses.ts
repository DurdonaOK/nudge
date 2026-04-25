import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  RenderedContent,
  WebhookEvent,
} from "../types.js";

export interface SesConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromAddress: string;
  fromName?: string;
  configurationSetName?: string;
}

export class SesAdapter implements ProviderAdapter {
  readonly name = "ses";
  readonly capabilities: ProviderCapabilities = {
    channels: ["email"],
    supportsDeliveryReceipts: true,
    supportsReadReceipts: true,
    supportsRichContent: true,
  };

  #config: SesConfig;

  constructor(config: SesConfig) {
    this.#config = config;
  }

  async send(payload: RenderedContent): Promise<ProviderSendResult> {
    if (payload.channel !== "email") {
      throw new Error(`SesAdapter does not support channel: ${payload.channel}`);
    }

    // Lazy import so consumers without AWS SDK don't pay the cost
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");

    const client = new SESClient({
      region: this.#config.region,
      credentials: {
        accessKeyId: this.#config.accessKeyId,
        secretAccessKey: this.#config.secretAccessKey,
      },
    });

    const from = this.#config.fromName
      ? `${this.#config.fromName} <${this.#config.fromAddress}>`
      : this.#config.fromAddress;

    const cmd = new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [payload.to] },
      Message: {
        Subject: { Data: payload.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: payload.html, Charset: "UTF-8" },
          Text: { Data: payload.text, Charset: "UTF-8" },
        },
      },
      ...(this.#config.configurationSetName
        ? { ConfigurationSetName: this.#config.configurationSetName }
        : {}),
    });

    const res = await client.send(cmd);
    return {
      providerMessageId: res.MessageId ?? "",
      status: "sent",
      costUsd: 0.0001, // ~$0.10 per 1000
      rawResponse: res,
    };
  }

  parseWebhook(body: unknown, _headers: Record<string, string>): WebhookEvent {
    const b = body as Record<string, unknown>;
    const notif = b["notificationType"] as string;
    return {
      type: notif === "Delivery" ? "delivery" : notif === "Bounce" ? "bounced" : "failed",
      messageId: (b["mail"] as Record<string, string>)?.["messageId"] ?? "",
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
