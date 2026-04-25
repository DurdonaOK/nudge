import type {
  Channel,
  Contact,
  EmailPayload,
  InAppPayload,
  IMessagePayload,
  PushPayload,
  RcsPayload,
  RenderedContent,
  SmsPayload,
  Template,
  TemplateVars,
  WhatsAppPayload,
} from "../types.js";

// ---------------------------------------------------------------------------
// Variable interpolation
// ---------------------------------------------------------------------------

function interpolate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

// ---------------------------------------------------------------------------
// Channel-specific renderers
// ---------------------------------------------------------------------------

function renderSms(body: string, contact: Contact): SmsPayload {
  // Strip markdown: bold, italic, links → plain text
  const plain = body
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/#+\s*/g, "")
    .trim();

  const chars = plain.length;
  const segments = Math.ceil(chars / 160);

  return { channel: "sms", to: contact.phone!, body: plain, segments };
}

function renderWhatsApp(
  template: Template,
  body: string,
  contact: Contact
): WhatsAppPayload {
  return {
    channel: "whatsapp",
    to: contact.phone!,
    type: template.id.startsWith("wa_") ? "template" : "text",
    templateName: template.id.startsWith("wa_") ? template.id : undefined,
    templateLanguage: contact.locale.split("-")[0],
    body,
    approvalStatus: "approved",
  };
}

function renderRcs(template: Template, body: string, contact: Contact): RcsPayload {
  return {
    channel: "rcs",
    to: contact.phone!,
    body,
    suggestedReplies: template.suggestedReplies,
    richCard: template.mediaUrl
      ? {
          title: template.subject ?? "",
          description: body.split("\n")[0] ?? body,
          mediaUrl: template.mediaUrl,
        }
      : undefined,
  };
}

async function renderEmail(
  template: Template,
  body: string,
  contact: Contact
): Promise<EmailPayload> {
  // Lazy import marked for HTML rendering
  const { marked } = await import("marked");
  const html = await marked(body);

  const plain = body
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .replace(/#+\s*/g, "")
    .trim();

  return {
    channel: "email",
    to: contact.email!,
    subject: interpolate(template.subject ?? "(no subject)", {}),
    html,
    text: plain,
  };
}

function renderPushFcm(template: Template, body: string, contact: Contact): PushPayload {
  const firstLine = body.split("\n")[0] ?? body;
  return {
    channel: "push_fcm",
    token: contact.fcmToken!,
    title: interpolate(template.subject ?? firstLine, {}),
    body: firstLine,
  };
}

function renderPushApns(template: Template, body: string, contact: Contact): PushPayload {
  const firstLine = body.split("\n")[0] ?? body;
  return {
    channel: "push_apns",
    token: contact.apnsToken!,
    title: interpolate(template.subject ?? firstLine, {}),
    body: firstLine,
  };
}

function renderIMessage(body: string, contact: Contact): IMessagePayload {
  return {
    channel: "imessage_business",
    to: contact.phone!,
    body,
    businessId: process.env["NUDGE_IMESSAGE_BUSINESS_ID"] ?? "",
  };
}

function renderInApp(template: Template, body: string, contact: Contact): InAppPayload {
  const firstLine = body.split("\n")[0] ?? body;
  return {
    channel: "in_app",
    userId: contact.inAppUserId!,
    title: interpolate(template.subject ?? firstLine, {}),
    body,
    imageUrl: template.mediaUrl,
  };
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

export async function render(
  template: Template,
  vars: TemplateVars,
  channel: Channel,
  contact: Contact
): Promise<RenderedContent> {
  const body = interpolate(template.body, vars);

  switch (channel) {
    case "sms":
      return renderSms(body, contact);
    case "whatsapp":
      return renderWhatsApp(template, body, contact);
    case "rcs":
      return renderRcs(template, body, contact);
    case "email":
      return renderEmail(template, body, contact);
    case "push_fcm":
      return renderPushFcm(template, body, contact);
    case "push_apns":
      return renderPushApns(template, body, contact);
    case "imessage_business":
      return renderIMessage(body, contact);
    case "in_app":
      return renderInApp(template, body, contact);
  }
}

/** Returns whether a template can gracefully degrade to a given channel */
export function canDegradeTo(template: Template, channel: Channel): boolean {
  // Templates that use RCS-only features can't degrade to plain channels
  if (template.suggestedReplies && template.suggestedReplies.length > 0) {
    if (channel === "sms" || channel === "email") return false;
  }
  return true;
}
