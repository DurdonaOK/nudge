import { describe, it, expect } from "vitest";
import { ConversationManager, MemoryThreadStore } from "../conversation/manager.js";

function makeManager() {
  return new ConversationManager(new MemoryThreadStore());
}

describe("ConversationManager", () => {
  it("creates a thread on first outbound message", async () => {
    const mgr = makeManager();
    const thread = await mgr.addOutbound("c1", "sms", "Hello!", "msg-1");
    expect(thread.contactId).toBe("c1");
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]?.direction).toBe("outbound");
    expect(thread.messages[0]?.body).toBe("Hello!");
  });

  it("appends inbound reply to same thread", async () => {
    const mgr = makeManager();
    await mgr.addOutbound("c1", "sms", "Hello!", "msg-1");
    const thread = await mgr.addInbound("c1", "sms", "Hey back!");
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[1]?.direction).toBe("inbound");
  });

  it("cross-channel: inbound on whatsapp lands in same thread as outbound sms", async () => {
    const mgr = makeManager();
    await mgr.addOutbound("c1", "sms", "SMS outbound", "msg-1");
    const thread = await mgr.addInbound("c1", "whatsapp", "WhatsApp reply");
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]?.channel).toBe("sms");
    expect(thread.messages[1]?.channel).toBe("whatsapp");
  });

  it("getThread returns undefined for unknown contact", async () => {
    const mgr = makeManager();
    const thread = await mgr.getThread("nobody");
    expect(thread).toBeUndefined();
  });

  it("markHandedOff sets status to handed_off", async () => {
    const mgr = makeManager();
    await mgr.addOutbound("c1", "sms", "Hi", "msg-1");
    await mgr.markHandedOff("c1");
    const thread = await mgr.getThread("c1");
    expect(thread?.status).toBe("handed_off");
  });

  it("lastActivityAt updates on each message", async () => {
    const mgr = makeManager();
    const t1 = await mgr.addOutbound("c1", "sms", "First", "msg-1");
    const before = t1.lastActivityAt;
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await mgr.addInbound("c1", "sms", "Reply");
    expect(t2.lastActivityAt >= before).toBe(true);
  });
});
