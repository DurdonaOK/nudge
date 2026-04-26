import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  RenderedContent,
  WebhookEvent,
} from "../types.js";

export interface ApnsConfig {
  /** P8 private key contents (-----BEGIN PRIVATE KEY-----...) */
  privateKey: string;
  /** Key ID from Apple Developer portal */
  keyId: string;
  /** Team ID from Apple Developer portal */
  teamId: string;
  /** App bundle ID */
  bundleId: string;
  /** Use sandbox endpoint (development); default false = production */
  sandbox?: boolean;
}

export class ApnsAdapter implements ProviderAdapter {
  readonly name = "apns";
  readonly capabilities: ProviderCapabilities = {
    channels: ["push_apns"],
    supportsDeliveryReceipts: false,
    supportsReadReceipts: false,
    supportsRichContent: true,
  };

  #config: ApnsConfig;
  #jwtToken: string | null = null;
  #jwtExpiry = 0;

  constructor(config: ApnsConfig) {
    this.#config = config;
  }

  async send(payload: RenderedContent): Promise<ProviderSendResult> {
    if (payload.channel !== "push_apns") {
      throw new Error(`ApnsAdapter does not support channel: ${payload.channel}`);
    }

    const token = await this.#getJwt();
    const host = this.#config.sandbox
      ? "api.sandbox.push.apple.com"
      : "api.push.apple.com";

    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        badge: payload.badge,
        sound: "default",
      },
      ...(payload.data ?? {}),
    });

    const res = await fetch(
      `https://${host}/3/device/${payload.token}`,
      {
        method: "POST",
        headers: {
          authorization: `bearer ${token}`,
          "apns-topic": this.#config.bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body,
      }
    );

    const apnsId = res.headers.get("apns-id") ?? crypto.randomUUID();

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(`APNs error ${res.status}: ${err["reason"] ?? "unknown"}`);
    }

    return { providerMessageId: apnsId, status: "sent", costUsd: 0, rawResponse: { apnsId } };
  }

  parseWebhook(_body: unknown, _headers: Record<string, string>): WebhookEvent {
    throw new Error("APNs does not deliver inbound webhooks");
  }

  async estimateCost(_payload: RenderedContent): Promise<number> {
    return 0; // APNs is free
  }

  async #getJwt(): Promise<string> {
    // Reuse token if it's less than 45 minutes old (Apple requires refresh < 60 min)
    if (this.#jwtToken && Date.now() < this.#jwtExpiry) return this.#jwtToken;

    const { createSign } = await import("crypto");
    const now = Math.floor(Date.now() / 1000);

    const header = Buffer.from(
      JSON.stringify({ alg: "ES256", kid: this.#config.keyId })
    ).toString("base64url");

    const claims = Buffer.from(
      JSON.stringify({ iss: this.#config.teamId, iat: now })
    ).toString("base64url");

    const unsigned = `${header}.${claims}`;
    const sign = createSign("SHA256");
    sign.update(unsigned);
    const sig = sign.sign(
      { key: this.#config.privateKey, dsaEncoding: "ieee-p1363" },
      "base64url"
    );

    this.#jwtToken = `${unsigned}.${sig}`;
    this.#jwtExpiry = Date.now() + 45 * 60 * 1000;
    return this.#jwtToken;
  }
}
