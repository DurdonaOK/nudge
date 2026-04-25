import type { WebhookEvent } from "../types.js";

type EventHandler = (event: WebhookEvent) => void | Promise<void>;

export class EventBus {
  #handlers = new Map<string, EventHandler[]>();

  on(eventType: WebhookEvent["type"] | "*", handler: EventHandler): void {
    const list = this.#handlers.get(eventType) ?? [];
    list.push(handler);
    this.#handlers.set(eventType, list);
  }

  off(eventType: WebhookEvent["type"] | "*", handler: EventHandler): void {
    const list = this.#handlers.get(eventType) ?? [];
    this.#handlers.set(
      eventType,
      list.filter((h) => h !== handler)
    );
  }

  async emit(event: WebhookEvent): Promise<void> {
    const specific = this.#handlers.get(event.type) ?? [];
    const wildcard = this.#handlers.get("*") ?? [];
    const all = [...specific, ...wildcard];
    await Promise.all(all.map((h) => h(event)));
  }
}

export const globalBus = new EventBus();
