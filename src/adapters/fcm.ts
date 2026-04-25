import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderSendResult,
  RenderedContent,
  WebhookEvent,
} from "../types.js";

export interface FcmConfig {
  /** Firebase project ID */
  projectId: string;
  /** Service account key JSON (stringified) or path to key file */
  serviceAccountKey: string;
}

export class FcmAdapter implements ProviderAdapter {
  readonly name = "fcm";
  readonly capabilities: ProviderCapabilities = {
    channels: ["push_fcm"],
    supportsDeliveryReceipts: false,
    supportsReadReceipts: false,
    supportsRichContent: true,
  };

  #config: FcmConfig;
  #accessToken: string | null = null;
  #tokenExpiry = 0;

  constructor(config: FcmConfig) {
    this.#config = config;
  }

  async send(payload: RenderedContent): Promise<ProviderSendResult> {
    if (payload.channel !== "push_fcm") {
      throw new Error(`FcmAdapter does not support channel: ${payload.channel}`);
    }

    const token = await this.#getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.#config.projectId}/messages:send`;

    const message = {
      message: {
        token: payload.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: "high" },
        apns: { headers: { "apns-priority": "10" } },
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`FCM error ${res.status}: ${JSON.stringify(err)}`);
    }

    const data = (await res.json()) as { name: string };
    return {
      providerMessageId: data.name,
      status: "sent",
      costUsd: 0,
      rawResponse: data,
    };
  }

  parseWebhook(_body: unknown, _headers: Record<string, string>): WebhookEvent {
    // FCM doesn't have inbound webhooks in the traditional sense
    throw new Error("FCM does not support inbound webhooks");
  }

  async estimateCost(_payload: RenderedContent): Promise<number> {
    return 0; // FCM is free
  }

  async #getAccessToken(): Promise<string> {
    if (this.#accessToken && Date.now() < this.#tokenExpiry) {
      return this.#accessToken;
    }

    // JWT-based OAuth2 for service accounts
    const key = JSON.parse(this.#config.serviceAccountKey) as {
      client_email: string;
      private_key: string;
    };

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claim = {
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    const encode = (obj: unknown) =>
      btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const unsigned = `${encode(header)}.${encode(claim)}`;

    // Node.js crypto for RSA signing
    const { createSign } = await import("crypto");
    const sign = createSign("RSA-SHA256");
    sign.update(unsigned);
    const signature = sign
      .sign(key.private_key, "base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    const jwt = `${unsigned}.${signature}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.#accessToken = data.access_token;
    this.#tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.#accessToken;
  }
}
