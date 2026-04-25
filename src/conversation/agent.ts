import Anthropic from "@anthropic-ai/sdk";
import type { ConversationThread } from "../types.js";

export interface AgentResponse {
  reply: string;
  confidence: number;
  shouldHandOff: boolean;
  handOffReason?: string;
}

const HANDOFF_PHRASES = [
  "speak to a human",
  "talk to someone",
  "real person",
  "agent please",
  "customer service",
];

export class ConversationAgent {
  #client: Anthropic;
  #model: string;
  #systemPrompt: string;
  #handOffThreshold: number;

  constructor(opts?: {
    model?: string;
    systemPrompt?: string;
    handOffThreshold?: number;
  }) {
    this.#client = new Anthropic();
    this.#model = opts?.model ?? "claude-haiku-4-5-20251001";
    this.#handOffThreshold = opts?.handOffThreshold ?? 0.6;
    this.#systemPrompt =
      opts?.systemPrompt ??
      `You are a helpful assistant responding to customer messages on behalf of a business.
Be concise, friendly, and accurate. If you're unsure, say so — don't guess.
Respond in the same language the customer used.`;
  }

  async respond(thread: ConversationThread, newMessage: string): Promise<AgentResponse> {
    // Build conversation history
    const messages: Anthropic.MessageParam[] = thread.messages.slice(-10).map((m) => ({
      role: m.direction === "outbound" ? "assistant" : "user",
      content: m.body,
    }));
    messages.push({ role: "user", content: newMessage });

    // Check for explicit hand-off request
    const lower = newMessage.toLowerCase();
    const explicitHandOff = HANDOFF_PHRASES.some((p) => lower.includes(p));

    const response = await this.#client.messages.create({
      model: this.#model,
      max_tokens: 512,
      system: this.#systemPrompt,
      messages,
    });

    const reply =
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("") || "";

    // Heuristic confidence: if stop_reason is end_turn and reply is non-empty, high confidence
    const confidence =
      response.stop_reason === "end_turn" && reply.length > 0 ? 0.85 : 0.4;

    const shouldHandOff = explicitHandOff || confidence < this.#handOffThreshold;

    return {
      reply,
      confidence,
      shouldHandOff,
      handOffReason: explicitHandOff
        ? "Customer requested human agent"
        : shouldHandOff
        ? "Low confidence response"
        : undefined,
    };
  }
}
