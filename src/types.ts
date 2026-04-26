import type { SpanContext } from "@opentelemetry/api";

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export type Channel =
  | "sms"
  | "whatsapp"
  | "rcs"
  | "email"
  | "push_fcm"
  | "push_apns"
  | "imessage_business"
  | "in_app";

export type MessageCategory = "transactional" | "marketing" | "otp" | "alert";

// ---------------------------------------------------------------------------
// Contact model
// ---------------------------------------------------------------------------

export interface ChannelAvailability {
  channel: Channel;
  available: boolean;
  /** ISO 8601 timestamp of last successful delivery */
  lastDelivered?: string;
  /** ISO 8601 timestamp of last open */
  lastOpened?: string;
  /** ISO 8601 timestamp of last reply */
  lastReplied?: string;
  deliveryRate: number; // 0–1
  openRate: number;     // 0–1
  replyRate: number;    // 0–1
}

export interface OptInState {
  channel: Channel;
  category: MessageCategory;
  optedIn: boolean;
  /** ISO 8601 */
  updatedAt: string;
  /** Evidence: "explicit", "import", "inferred" */
  source: "explicit" | "import" | "inferred";
}

export interface QuietHours {
  /** IANA timezone, e.g. "America/New_York" */
  timezone: string;
  /** 0–23 */
  startHour: number;
  endHour: number;
}

export interface Contact {
  id: string;
  name?: string;
  /** E.164 */
  phone?: string;
  email?: string;
  /** FCM registration token */
  fcmToken?: string;
  /** APNs device token */
  apnsToken?: string;
  /** In-app user ID */
  inAppUserId?: string;
  locale: string; // BCP 47, e.g. "en-US"
  timezone: string; // IANA
  channels: ChannelAvailability[];
  optIns: OptInState[];
  quietHours?: QuietHours;
  /** ISO 8601 */
  lastContactedAt?: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TemplateVars {
  [key: string]: string | number | boolean;
}

export interface Template {
  id: string;
  /** Markdown source with {{variable}} interpolation */
  body: string;
  subject?: string; // email subject
  /** Channels this template supports; undefined = all */
  channels?: Channel[];
  /** RCS quick-reply chip labels (plain strings, auto-converted to reply actions) */
  suggestedReplies?: string[];
  /** Rich media URL (images, cards) */
  mediaUrl?: string;
  /** Explicit RCS rich card config — overrides auto-extraction from markdown */
  richCard?: Omit<RcsRichCard, "title" | "description">;
  /** RCS carousel — when set, renders as multi-card carousel */
  carousel?: RcsCarouselCard[];
  category: MessageCategory;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface RoutingOverride {
  channel: Channel;
  provider?: string;
}

export interface RoutingDecision {
  channel: Channel;
  provider: string;
  score: number;
  reason: string;
  estimatedCostUsd: number;
  estimatedDeliveryMs: number;
  fallbacks: Array<{ channel: Channel; provider: string }>;
}

// ---------------------------------------------------------------------------
// Send request / result
// ---------------------------------------------------------------------------

export interface SendOptions {
  /** Caller-supplied idempotency key — exactly-once semantics per key */
  idempotencyKey?: string;
  /** Force a specific channel+provider, bypassing routing */
  override?: RoutingOverride;
  /** Schedule for later; ISO 8601 */
  scheduledAt?: string;
  /** Do not actually deliver; return what would have been sent */
  dryRun?: boolean;
  /** A/B variant label */
  abVariant?: string;
  traceContext?: SpanContext;
}

export interface SendRequest {
  contact: Contact | string; // Contact object or contact ID
  template: Template | string; // Template object or template ID
  vars: TemplateVars;
  options?: SendOptions;
}

export type DeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "replied"
  | "failed"
  | "dry_run";

export interface SendResult {
  messageId: string;
  idempotencyKey: string;
  channel: Channel;
  provider: string;
  status: DeliveryStatus;
  routing: RoutingDecision;
  renderedContent: RenderedContent;
  costUsd: number;
  dryRun: boolean;
  /** ISO 8601 */
  sentAt?: string;
  error?: SendError;
}

export interface SendError {
  code: string;
  message: string;
  retryable: boolean;
  providerCode?: string;
}

// ---------------------------------------------------------------------------
// Rendered content (channel-specific payloads)
// ---------------------------------------------------------------------------

export interface SmsPayload {
  channel: "sms";
  to: string;
  body: string;
  /** Segments (160 chars each) */
  segments: number;
}

export interface WhatsAppPayload {
  channel: "whatsapp";
  to: string;
  type: "template" | "text" | "interactive";
  templateName?: string;
  templateLanguage?: string;
  body: string;
  /** WhatsApp template approval status */
  approvalStatus?: "approved" | "pending" | "rejected";
}

// ---------------------------------------------------------------------------
// RCS rich content types
// ---------------------------------------------------------------------------

export type RcsActionType = "reply" | "open_url" | "dial" | "share_location" | "calendar";
export type RcsMediaHeight = "SHORT" | "MEDIUM" | "TALL";
export type RcsCardOrientation = "VERTICAL" | "HORIZONTAL";
export type RcsCardAlignment = "LEFT" | "RIGHT";

export interface RcsAction {
  type: RcsActionType;
  label: string;
  /** For open_url */
  url?: string;
  /** For dial */
  phone?: string;
  /** For reply — text sent back when tapped */
  reply?: string;
  /** For calendar — ISO 8601 start/end */
  calendarStart?: string;
  calendarEnd?: string;
  calendarTitle?: string;
}

export interface RcsRichCard {
  title: string;
  description: string;
  mediaUrl?: string;
  mediaHeight?: RcsMediaHeight;
  /** Only for standalone card, not carousel items */
  orientation?: RcsCardOrientation;
  thumbnailUrl?: string;
  actions?: RcsAction[];
}

export interface RcsCarouselCard {
  title: string;
  description: string;
  mediaUrl?: string;
  mediaHeight?: RcsMediaHeight;
  actions?: RcsAction[];
}

export interface RcsPayload {
  channel: "rcs";
  to: string;
  /** Plain-text fallback for devices that don't support RCS */
  fallbackText: string;
  richCard?: RcsRichCard;
  carousel?: RcsCarouselCard[];
  /** Quick-reply chips shown below the card */
  suggestedReplies?: RcsAction[];
}

export interface EmailPayload {
  channel: "email";
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface PushPayload {
  channel: "push_fcm" | "push_apns";
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
}

export interface IMessagePayload {
  channel: "imessage_business";
  to: string;
  body: string;
  businessId: string;
}

export interface InAppPayload {
  channel: "in_app";
  userId: string;
  title: string;
  body: string;
  imageUrl?: string;
  actions?: Array<{ label: string; url: string }>;
}

export type RenderedContent =
  | SmsPayload
  | WhatsAppPayload
  | RcsPayload
  | EmailPayload
  | PushPayload
  | IMessagePayload
  | InAppPayload;

// ---------------------------------------------------------------------------
// Provider adapter interface
// ---------------------------------------------------------------------------

export interface ProviderCapabilities {
  channels: Channel[];
  supportsDeliveryReceipts: boolean;
  supportsReadReceipts: boolean;
  supportsRichContent: boolean;
}

export interface ProviderSendResult {
  providerMessageId: string;
  status: DeliveryStatus;
  costUsd?: number;
  rawResponse?: unknown;
}

export interface ProviderAdapter {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  send(payload: RenderedContent): Promise<ProviderSendResult>;
  /** Verify a webhook signature; returns parsed event or throws */
  parseWebhook(body: unknown, headers: Record<string, string>): WebhookEvent;
  /** Estimated cost without actually sending */
  estimateCost(payload: RenderedContent): Promise<number>;
}

// ---------------------------------------------------------------------------
// Webhook / lifecycle events
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | "delivery"
  | "open"
  | "reply"
  | "opt_out"
  | "opt_in"
  | "failed"
  | "bounced";

export interface WebhookEvent {
  type: WebhookEventType;
  messageId: string;
  channel: Channel;
  provider: string;
  contactId?: string;
  /** ISO 8601 */
  occurredAt: string;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  id: string;
  threadId: string;
  contactId: string;
  channel: Channel;
  direction: "outbound" | "inbound";
  body: string;
  /** ISO 8601 */
  sentAt: string;
  metadata: Record<string, unknown>;
}

export interface ConversationThread {
  id: string;
  contactId: string;
  /** Cross-channel: messages may span multiple channels */
  messages: ConversationMessage[];
  status: "open" | "resolved" | "handed_off";
  /** ISO 8601 */
  lastActivityAt: string;
  assignedAgent?: string;
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export interface ComplianceCheck {
  allowed: boolean;
  reason?: string;
  /** Suggested retry time if blocked by quiet hours */
  retryAfter?: string;
}
