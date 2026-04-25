import type { Channel, Contact, MessageCategory, OptInState } from "../types.js";

export interface ContactStore {
  get(id: string): Promise<Contact | undefined>;
  upsert(contact: Contact): Promise<void>;
  recordDelivery(contactId: string, channel: Channel): Promise<void>;
  recordOpen(contactId: string, channel: Channel): Promise<void>;
  recordReply(contactId: string, channel: Channel): Promise<void>;
  setOptIn(contactId: string, state: OptInState): Promise<void>;
  updateLastContacted(contactId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (development / testing)
// ---------------------------------------------------------------------------

export class MemoryContactStore implements ContactStore {
  private contacts = new Map<string, Contact>();

  async get(id: string): Promise<Contact | undefined> {
    return this.contacts.get(id);
  }

  async upsert(contact: Contact): Promise<void> {
    this.contacts.set(contact.id, { ...contact });
  }

  async recordDelivery(contactId: string, channel: Channel): Promise<void> {
    await this.#updateChannelStat(contactId, channel, "lastDelivered");
  }

  async recordOpen(contactId: string, channel: Channel): Promise<void> {
    await this.#updateChannelStat(contactId, channel, "lastOpened");
  }

  async recordReply(contactId: string, channel: Channel): Promise<void> {
    await this.#updateChannelStat(contactId, channel, "lastReplied");
  }

  async setOptIn(contactId: string, state: OptInState): Promise<void> {
    const contact = this.contacts.get(contactId);
    if (!contact) return;
    const idx = contact.optIns.findIndex(
      (o) => o.channel === state.channel && o.category === state.category
    );
    if (idx >= 0) {
      contact.optIns[idx] = state;
    } else {
      contact.optIns.push(state);
    }
  }

  async updateLastContacted(contactId: string): Promise<void> {
    const contact = this.contacts.get(contactId);
    if (contact) {
      contact.lastContactedAt = new Date().toISOString();
    }
  }

  async #updateChannelStat(
    contactId: string,
    channel: Channel,
    field: "lastDelivered" | "lastOpened" | "lastReplied"
  ): Promise<void> {
    const contact = this.contacts.get(contactId);
    if (!contact) return;
    const ch = contact.channels.find((c) => c.channel === channel);
    if (ch) {
      ch[field] = new Date().toISOString();
    }
  }
}

export function isOptedIn(
  contact: Contact,
  channel: Channel,
  category: MessageCategory
): boolean {
  return contact.optIns.some(
    (o) => o.channel === channel && o.category === category && o.optedIn
  );
}
