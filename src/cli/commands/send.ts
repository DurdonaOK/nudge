import { Command } from "commander";
import type { Contact, Template } from "../../types.js";
import { NudgeClient } from "../../index.js";
import { TwilioAdapter } from "../../adapters/twilio.js";

export function sendCommand(): Command {
  return new Command("send")
    .description("Send a message to a contact")
    .requiredOption("--to <phone>", "Recipient phone number (E.164)")
    .requiredOption("--template <id>", "Template ID")
    .requiredOption("--body <text>", "Message body (supports {{var}} interpolation)")
    .option("--vars <json>", "Template variables as JSON string", "{}")
    .option("--channel <channel>", "Force a specific channel (bypass routing)")
    .option("--dry-run", "Simulate send without delivering", false)
    .option("--idempotency-key <key>", "Idempotency key for exactly-once delivery")
    .action(async (opts) => {
      const vars = JSON.parse(opts.vars as string) as Record<string, string>;

      // Build a minimal contact from CLI flags
      const contact: Contact = {
        id: crypto.randomUUID(),
        phone: opts.to as string,
        locale: "en-US",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        channels: [
          {
            channel: "sms",
            available: true,
            deliveryRate: 0.95,
            openRate: 0.3,
            replyRate: 0.05,
          },
        ],
        optIns: [
          {
            channel: "sms",
            category: "transactional",
            optedIn: true,
            updatedAt: new Date().toISOString(),
            source: "explicit",
          },
        ],
        metadata: {},
      };

      const template: Template = {
        id: opts.template as string,
        body: opts.body as string,
        category: "transactional",
        channels: opts.channel ? ([opts.channel] as never) : undefined,
      };

      // Require TWILIO_* env vars for real sends
      const accountSid = process.env["TWILIO_ACCOUNT_SID"];
      const authToken = process.env["TWILIO_AUTH_TOKEN"];
      const fromPhone = process.env["TWILIO_FROM_PHONE"];

      if (!opts.dryRun && (!accountSid || !authToken || !fromPhone)) {
        console.error(
          "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_PHONE to send (or use --dry-run)"
        );
        process.exit(1);
      }

      const client = new NudgeClient({
        adapters: opts.dryRun
          ? []
          : [
              new TwilioAdapter({
                accountSid: accountSid!,
                authToken: authToken!,
                fromPhone: fromPhone!,
              }),
            ],
      });

      const result = await client.send(contact, template, vars, {
        dryRun: opts.dryRun as boolean,
        override: opts.channel ? { channel: opts.channel as never } : undefined,
        idempotencyKey: opts.idempotencyKey as string | undefined,
      });

      console.log(JSON.stringify(result, null, 2));
    });
}
