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

// ---------------------------------------------------------------------------
// RCS markdown extraction helpers
// ---------------------------------------------------------------------------

interface ParsedMarkdown {
  title: string;
  description: string;
  actions: import("../types.js").RcsAction[];
  plainText: string;
}

function parseMarkdownForRcs(body: string): ParsedMarkdown {
  const lines = body.split("\n");
  let title = "";
  const descLines: string[] = [];
  const actions: import("../types.js").RcsAction[] = [];

  for (const line of lines) {
    // # Heading → card title (first one wins)
    const headingMatch = /^#{1,3}\s+(.+)/.exec(line);
    if (headingMatch && !title) {
      title = headingMatch[1]!.trim();
      continue;
    }

    // [Label](tel:+1...) → dial action
    const telMatch = /\[([^\]]+)\]\(tel:([^)]+)\)/.exec(line);
    if (telMatch) {
      actions.push({ type: "dial", label: telMatch[1]!, phone: telMatch[2]! });
      descLines.push(line.replace(telMatch[0], telMatch[1]!));
      continue;
    }

    // [Label](https://...) → open_url action
    const urlMatch = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(line);
    if (urlMatch) {
      actions.push({ type: "open_url", label: urlMatch[1]!, url: urlMatch[2]! });
      descLines.push(line.replace(urlMatch[0], urlMatch[1]!));
      continue;
    }

    descLines.push(line);
  }

  // Strip remaining markdown from description
  const rawDesc = descLines.join("\n");
  const description = rawDesc
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .trim();

  const plainText = body
    .replace(/#{1,3}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

  return { title: title || description.split("\n")[0] || "", description, actions, plainText };
}

function buildSuggestedReplies(
  labels?: string[]
): import("../types.js").RcsAction[] | undefined {
  if (!labels || labels.length === 0) return undefined;
  return labels.map((label) => ({ type: "reply" as const, label, reply: label }));
}

function renderRcs(template: Template, body: string, contact: Contact): RcsPayload {
  const parsed = parseMarkdownForRcs(body);
  const suggestedReplies = buildSuggestedReplies(template.suggestedReplies);

  // Carousel mode — template explicitly defines multiple cards
  if (template.carousel && template.carousel.length > 0) {
    return {
      channel: "rcs",
      to: contact.phone!,
      fallbackText: parsed.plainText,
      carousel: template.carousel,
      suggestedReplies,
    };
  }

  // Rich card mode — has media or explicit richCard config
  const hasMedia = !!(template.mediaUrl ?? template.richCard?.mediaUrl);
  if (hasMedia || parsed.actions.length > 0 || template.richCard) {
    const card: import("../types.js").RcsRichCard = {
      title: parsed.title,
      description: parsed.description,
      mediaUrl: template.richCard?.mediaUrl ?? template.mediaUrl,
      mediaHeight: template.richCard?.mediaHeight ?? "MEDIUM",
      orientation: template.richCard?.orientation ?? "VERTICAL",
      thumbnailUrl: template.richCard?.thumbnailUrl,
      actions: [
        ...(template.richCard?.actions ?? []),
        ...parsed.actions,
      ],
    };
    return {
      channel: "rcs",
      to: contact.phone!,
      fallbackText: parsed.plainText,
      richCard: card,
      suggestedReplies,
    };
  }

  // Text-only fallback — no card
  return {
    channel: "rcs",
    to: contact.phone!,
    fallbackText: parsed.plainText,
    suggestedReplies,
  };
}

async function renderEmail(
  template: Template,
  vars: TemplateVars,
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
    subject: interpolate(template.subject ?? "(no subject)", vars),
    html,
    text: plain,
  };
}

function renderPushFcm(template: Template, vars: TemplateVars, body: string, contact: Contact): PushPayload {
  const firstLine = body.split("\n")[0] ?? body;
  return {
    channel: "push_fcm",
    token: contact.fcmToken!,
    title: interpolate(template.subject ?? firstLine, vars),
    body: firstLine,
  };
}

function renderPushApns(template: Template, vars: TemplateVars, body: string, contact: Contact): PushPayload {
  const firstLine = body.split("\n")[0] ?? body;
  return {
    channel: "push_apns",
    token: contact.apnsToken!,
    title: interpolate(template.subject ?? firstLine, vars),
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

function renderInApp(template: Template, vars: TemplateVars, body: string, contact: Contact): InAppPayload {
  const firstLine = body.split("\n")[0] ?? body;
  return {
    channel: "in_app",
    userId: contact.inAppUserId!,
    title: interpolate(template.subject ?? firstLine, vars),
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
      return renderEmail(template, vars, body, contact);
    case "push_fcm":
      return renderPushFcm(template, vars, body, contact);
    case "push_apns":
      return renderPushApns(template, vars, body, contact);
    case "imessage_business":
      return renderIMessage(body, contact);
    case "in_app":
      return renderInApp(template, vars, body, contact);
  }
}

/** Returns whether a template can gracefully degrade to a given channel */
export function canDegradeTo(template: Template, channel: Channel): boolean {
  const hasRcsOnlyFeatures =
    (template.suggestedReplies && template.suggestedReplies.length > 0) ||
    !!template.carousel ||
    !!template.richCard;
  if (hasRcsOnlyFeatures && (channel === "sms" || channel === "email")) return false;
  return true;
}
