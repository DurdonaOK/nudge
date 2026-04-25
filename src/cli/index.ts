#!/usr/bin/env node
import { Command } from "commander";
import { sendCommand } from "./commands/send.js";
import { contactsCommand } from "./commands/contacts.js";

const program = new Command();

program
  .name("nudge")
  .description("AI-routed omnichannel messaging CLI")
  .version("0.1.0");

program.addCommand(sendCommand());
program.addCommand(contactsCommand());

program.parse(process.argv);
