import type {
  Channel,
  ConversationMessage,
  ConversationThread,
} from "../types.js";

export interface ThreadStore {
  getByContactId(contactId: string): Promise<ConversationThread | undefined>;
  save(thread: ConversationThread): Promise<void>;
}

export class MemoryThreadStore implements ThreadStore {
  #threads = new Map<string, ConversationThread>();

  async getByContactId(contactId: string): Promise<ConversationThread | undefined> {
    return [...this.#threads.values()].find((t) => t.contactId === contactId);
  }

  async save(thread: ConversationThread): Promise<void> {
    this.#threads.set(thread.id, thread);
  }
}

export class ConversationManager {
  #store: ThreadStore;

  constructor(store: ThreadStore) {
    this.#store = store;
  }

  async addOutbound(
    contactId: string,
    channel: Channel,
    body: string,
    messageId: string
  ): Promise<ConversationThread> {
    const thread = await this.#getOrCreate(contactId);
    const msg: ConversationMessage = {
      id: messageId,
      threadId: thread.id,
      contactId,
      channel,
      direction: "outbound",
      body,
      sentAt: new Date().toISOString(),
      metadata: {},
    };
    thread.messages.push(msg);
    thread.lastActivityAt = msg.sentAt;
    await this.#store.save(thread);
    return thread;
  }

  async addInbound(
    contactId: string,
    channel: Channel,
    body: string
  ): Promise<ConversationThread> {
    const thread = await this.#getOrCreate(contactId);
    const msg: ConversationMessage = {
      id: crypto.randomUUID(),
      threadId: thread.id,
      contactId,
      channel,
      direction: "inbound",
      body,
      sentAt: new Date().toISOString(),
      metadata: {},
    };
    thread.messages.push(msg);
    thread.lastActivityAt = msg.sentAt;
    await this.#store.save(thread);
    return thread;
  }

  async getThread(contactId: string): Promise<ConversationThread | undefined> {
    return this.#store.getByContactId(contactId);
  }

  async markHandedOff(contactId: string): Promise<void> {
    const thread = await this.#store.getByContactId(contactId);
    if (thread) {
      thread.status = "handed_off";
      await this.#store.save(thread);
    }
  }

  async #getOrCreate(contactId: string): Promise<ConversationThread> {
    const existing = await this.#store.getByContactId(contactId);
    if (existing) return existing;

    const thread: ConversationThread = {
      id: crypto.randomUUID(),
      contactId,
      messages: [],
      status: "open",
      lastActivityAt: new Date().toISOString(),
    };
    await this.#store.save(thread);
    return thread;
  }
}
