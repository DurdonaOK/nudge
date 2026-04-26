# nudge

AI-routed omnichannel messaging. One `send()` call across SMS, WhatsApp, RCS, email, push (FCM/APNs), iMessage Business, and in-app — with provider-agnostic adapters so you're never locked in.

## What makes it different

**Engagement-weighted routing, not just cost.** Routes each message to the channel the recipient is most likely to open and reply on, using per-contact historical engagement data. Cost is a tiebreaker, not the primary signal.

**One template, every channel.** Author in markdown + `{{variables}}`; nudge auto-renders to SMS plain text, WhatsApp rich/template, RCS cards with suggested actions, email HTML+text, push payload, and in-app card. Template-aware fallbacks — won't degrade an RCS card to SMS if the message relies on action buttons.

**Conversational by default.** Inbound replies are routed to a Claude Haiku agent with tool access. Clean human-handoff escalation when confidence drops or the user asks for a person. Threaded conversation state per contact across channels.

**Production-grade DX.** Idempotency keys on every send, OpenTelemetry traces, per-channel metrics, A/B testing with deterministic sticky assignment, dry-run mode, and a CLI for testing without burning credits.

**Built-in compliance.** 10DLC registration warnings, GDPR/EU opt-in enforcement, quiet hours per locale, region-specific consent rules, STOP/START keyword detection.

---

## Quickstart

```bash
npm install
cp .env.example .env   # fill in your provider credentials
npm run build
```

### Dry-run a send (no credentials needed)

```bash
node dist/cli/index.js send \
  --to "+15555550100" \
  --template "otp" \
  --body "Your code is {{code}}. Expires in {{minutes}} min." \
  --vars '{"code":"123456","minutes":"10"}' \
  --dry-run
```

### SDK usage

```typescript
import { NudgeClient, TwilioAdapter } from "nudge";

const nudge = new NudgeClient({
  adapters: [
    new TwilioAdapter({
      accountSid: process.env.TWILIO_ACCOUNT_SID!,
      authToken: process.env.TWILIO_AUTH_TOKEN!,
      fromPhone: process.env.TWILIO_FROM_PHONE!,
    }),
  ],
});

const result = await nudge.send(
  {
    id: "user-123",
    phone: "+15555550100",
    locale: "en-US",
    timezone: "America/New_York",
    channels: [{ channel: "sms", available: true, deliveryRate: 0.95, openRate: 0.3, replyRate: 0.05 }],
    optIns: [{ channel: "sms", category: "transactional", optedIn: true, updatedAt: new Date().toISOString(), source: "explicit" }],
    metadata: {},
  },
  { id: "welcome", body: "Hey {{name}}, welcome!", category: "transactional" },
  { name: "Alice" }
);

console.log(result.status); // "sent"
```

### RCS rich card with suggested actions

```typescript
await nudge.send(contact, {
  id: "order-shipped",
  body: "# Your order shipped!\n\nTrack it in real time.",
  richCard: {
    mediaUrl: "https://cdn.example.com/box.png",
    mediaHeight: "MEDIUM",
    actions: [
      { type: "open_url", label: "Track order", url: "https://example.com/track/123" },
      { type: "reply", label: "Contact support", reply: "SUPPORT" },
    ],
  },
  category: "transactional",
}, { order: "ORD-9821" });
```

### A/B testing

```typescript
import { assignVariant } from "nudge";

const experiment = {
  id: "welcome-copy",
  variants: [
    { name: "control",   weight: 0.5, template: { id: "welcome-a", body: "Welcome, {{name}}!", category: "marketing" } },
    { name: "treatment", weight: 0.5, template: { id: "welcome-b", body: "Hey {{name}} 👋 glad you're here!", category: "marketing" } },
  ],
};

const variant = assignVariant(experiment, contact); // deterministic per contact
await nudge.send(contact, variant.template, { name: "Alice" }, { abVariant: variant.name });
```

### Webhook server (delivery receipts + opt-outs)

```typescript
import { createWebhookServer, AdapterRegistry, EventBus, TwilioAdapter } from "nudge";

const registry = new AdapterRegistry();
registry.register(new TwilioAdapter({ ... }));
const bus = new EventBus();

// Auto-detects STOP/START keywords and emits opt_out/opt_in events
bus.on("opt_out", async (event) => {
  await contactStore.setOptIn(event.contactId!, { channel: event.channel, category: "marketing", optedIn: false, ... });
});

const server = createWebhookServer({ port: 3001, registry, bus });
await server.start();
// Point Twilio status callback to: https://yourhost/webhooks/twilio
```

### Redis idempotency (cross-process exactly-once)

```typescript
import { NudgeClient, RedisIdempotencyStore } from "nudge";

const nudge = new NudgeClient({
  adapters: [...],
  idempotency: new RedisIdempotencyStore({ url: process.env.REDIS_URL! }),
});

// Safe to call multiple times with same key — only sends once
await nudge.send(contact, template, vars, { idempotencyKey: "order-123-confirm" });
await nudge.send(contact, template, vars, { idempotencyKey: "order-123-confirm" }); // no-op
```

### Per-channel metrics

```typescript
import { globalMetrics } from "nudge";

// After sending...
const stats = globalMetrics.channelStats();
// [{ channel: "sms", sent: 100, delivered: 96, openRate: 0.31, replyRate: 0.05, totalCostUsd: 0.79 }, ...]

console.log("Total spend:", globalMetrics.totalCost());
```

---

## Adapters

| Provider | Channels | Notes |
|---|---|---|
| `TwilioAdapter` | SMS, WhatsApp, RCS | Most complete; supports delivery receipts |
| `SesAdapter` | Email | AWS SES; lazy `@aws-sdk/client-ses` import |
| `VonageAdapter` | SMS, WhatsApp | Good EU coverage |
| `MessageBirdAdapter` | SMS, WhatsApp | Alternative to Vonage |
| `FcmAdapter` | Push (Android) | JWT service-account auth |
| `ApnsAdapter` | Push (iOS) | ES256 JWT; auto-refreshes every 45 min |

## Project structure

```
src/
├── types.ts               # All core types
├── sender.ts              # send() — route → comply → render → deliver
├── index.ts               # Public API + NudgeClient factory
├── adapters/              # Provider adapters + registry
├── routing/               # Engine, engagement scorer, send-time optimizer
├── templates/             # Markdown renderer (all channels) + file store
├── contacts/              # ContactStore interface + in-memory impl
├── idempotency/           # MemoryIdempotencyStore + RedisIdempotencyStore
├── conversation/          # Cross-channel thread state + Claude Haiku agent
├── compliance/            # Opt-in enforcement, quiet hours, GDPR, 10DLC
├── events/                # EventBus (lifecycle webhooks)
├── webhook/               # HTTP server for inbound delivery receipts
├── ab/                    # A/B experiment assignment + conversion tracking
├── metrics/               # Per-channel cost/latency/deliverability stats
├── telemetry/             # OpenTelemetry span helpers
└── cli/                   # nudge send / nudge contacts scan
```

## Commands

```bash
npm run build          # compile TypeScript
npm test               # run all tests (70 tests, ~1s)
npm run typecheck      # type-check without emitting
```

## Environment variables

See `.env.example` for the full list. The minimum for a dry-run is nothing — no env vars required.
For real SMS sends: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_PHONE`.
