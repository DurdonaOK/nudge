import type {
  Contact,
  DeliveryStatus,
  SendOptions,
  SendResult,
  Template,
  TemplateVars,
} from "./types.js";
import type { ContactStore } from "./contacts/store.js";
import { AdapterRegistry } from "./adapters/registry.js";
import { RoutingEngine } from "./routing/engine.js";
import { render, canDegradeTo } from "./templates/engine.js";
import { checkCompliance } from "./compliance/index.js";
import { globalBus } from "./events/bus.js";
import { ConversationManager } from "./conversation/manager.js";
import { startSendSpan, recordSuccess, recordError } from "./telemetry/otel.js";

// In-memory idempotency store (replace with Redis/DB in production)
const idempotencyCache = new Map<string, SendResult>();

export interface SenderDeps {
  registry: AdapterRegistry;
  contacts: ContactStore;
  router: RoutingEngine;
  conversations?: ConversationManager;
}

export async function send(
  contact: Contact,
  template: Template,
  vars: TemplateVars,
  opts: SendOptions = {},
  deps: SenderDeps
): Promise<SendResult> {
  const idempotencyKey = opts.idempotencyKey ?? crypto.randomUUID();

  // Exactly-once: return cached result for duplicate keys
  const cached = idempotencyCache.get(idempotencyKey);
  if (cached) return cached;

  const span = startSendSpan({
    "nudge.contact_id": contact.id,
    "nudge.template_id": template.id,
    "nudge.idempotency_key": idempotencyKey,
    "nudge.dry_run": String(opts.dryRun ?? false),
  });

  try {
    // Route
    const routing = await deps.router.route(contact, template, opts.override);

    // Compliance check
    const compliance = checkCompliance(contact, routing.channel, template.category);
    if (!compliance.allowed) {
      const result: SendResult = {
        messageId: crypto.randomUUID(),
        idempotencyKey,
        channel: routing.channel,
        provider: routing.provider,
        status: "failed",
        routing,
        renderedContent: { channel: routing.channel } as never,
        costUsd: 0,
        dryRun: false,
        error: {
          code: "COMPLIANCE_BLOCK",
          message: compliance.reason ?? "Compliance check failed",
          retryable: !!compliance.retryAfter,
        },
      };
      idempotencyCache.set(idempotencyKey, result);
      return result;
    }

    // Render
    let rendered = await render(template, vars, routing.channel, contact);

    // Graceful degradation: try fallbacks if template can't degrade
    if (!canDegradeTo(template, routing.channel)) {
      for (const fallback of routing.fallbacks) {
        if (canDegradeTo(template, fallback.channel)) {
          rendered = await render(template, vars, fallback.channel, contact);
          routing.channel = fallback.channel;
          routing.provider = fallback.provider;
          break;
        }
      }
    }

    // Dry run
    if (opts.dryRun) {
      const result: SendResult = {
        messageId: crypto.randomUUID(),
        idempotencyKey,
        channel: routing.channel,
        provider: routing.provider,
        status: "dry_run",
        routing,
        renderedContent: rendered,
        costUsd: routing.estimatedCostUsd,
        dryRun: true,
        sentAt: new Date().toISOString(),
      };
      recordSuccess(span, { "nudge.status": "dry_run" });
      return result;
    }

    // Send
    const adapter = deps.registry.get(routing.provider);
    if (!adapter) throw new Error(`No adapter for provider: ${routing.provider}`);

    const providerResult = await adapter.send(rendered);

    const result: SendResult = {
      messageId: providerResult.providerMessageId,
      idempotencyKey,
      channel: routing.channel,
      provider: routing.provider,
      status: providerResult.status,
      routing,
      renderedContent: rendered,
      costUsd: providerResult.costUsd ?? routing.estimatedCostUsd,
      dryRun: false,
      sentAt: new Date().toISOString(),
    };

    idempotencyCache.set(idempotencyKey, result);

    // Update contact last-contacted
    await deps.contacts.updateLastContacted(contact.id);

    // Track outbound in conversation thread
    if (deps.conversations) {
      await deps.conversations.addOutbound(
        contact.id,
        routing.channel,
        "body" in rendered ? (rendered as { body: string }).body : "",
        result.messageId
      );
    }

    // Emit lifecycle event
    await globalBus.emit({
      type: "delivery",
      messageId: result.messageId,
      channel: routing.channel,
      provider: routing.provider,
      contactId: contact.id,
      occurredAt: result.sentAt!,
      payload: providerResult.rawResponse,
    });

    recordSuccess(span, {
      "nudge.message_id": result.messageId,
      "nudge.channel": result.channel,
      "nudge.provider": result.provider,
      "nudge.cost_usd": result.costUsd,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    recordError(span, error);

    const failResult: SendResult = {
      messageId: crypto.randomUUID(),
      idempotencyKey,
      channel: "sms",
      provider: "unknown",
      status: "failed",
      routing: {
        channel: "sms",
        provider: "unknown",
        score: 0,
        reason: "error",
        estimatedCostUsd: 0,
        estimatedDeliveryMs: 0,
        fallbacks: [],
      },
      renderedContent: { channel: "sms" } as never,
      costUsd: 0,
      dryRun: false,
      error: { code: "SEND_ERROR", message: error.message, retryable: false },
    };
    idempotencyCache.set(idempotencyKey, failResult);
    return failResult;
  }
}
