import { Command } from "commander";
import type { Channel, Contact, OptInState } from "../../types.js";

export function contactsCommand(): Command {
  const cmd = new Command("contacts").description("Manage contacts");

  cmd
    .command("scan")
    .description("Scan which channels are reachable for a contact")
    .requiredOption("--phone <phone>", "E.164 phone number")
    .option("--email <email>", "Email address")
    .action((opts) => {
      const channels: Array<{ channel: Channel; reachable: boolean; note: string }> = [
        {
          channel: "sms",
          reachable: !!opts.phone,
          note: opts.phone ? "phone present" : "no phone",
        },
        {
          channel: "whatsapp",
          reachable: !!opts.phone,
          note: opts.phone ? "phone present (opt-in required)" : "no phone",
        },
        {
          channel: "rcs",
          reachable: !!opts.phone,
          note: "device support varies",
        },
        {
          channel: "email",
          reachable: !!opts.email,
          note: opts.email ? "email present" : "no email",
        },
      ];

      console.log(JSON.stringify(channels, null, 2));
    });

  cmd
    .command("show")
    .description("Show a contact record (from memory — useful in scripts)")
    .argument("<id>", "Contact ID")
    .action((id) => {
      console.log(`Contact ${id}: (connect a real store to see data)`);
    });

  return cmd;
}
