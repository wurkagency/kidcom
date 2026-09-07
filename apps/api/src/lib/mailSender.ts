import nodemailer from "nodemailer";

import { config } from "../config";

// Email-sending interface — same "swappable" treatment MediaStorage got in
// chunk 5. Two implementations below: a console-logging stub for local dev
// (no SMTP_* env vars set) and a real SMTP sender for production — the
// choice is made once, at module load, from config alone, so every call
// site (invites, verification emails, ...) stays identical in both
// environments.
export interface MailSender {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export class ConsoleMailSender implements MailSender {
  async send(message: { to: string; subject: string; text: string }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[mail] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
  }
}

export class SmtpMailSender implements MailSender {
  private transport: ReturnType<typeof nodemailer.createTransport>;

  constructor(host: string, port: number, user?: string, pass?: string) {
    this.transport = nodemailer.createTransport({
      host,
      port,
      // Port 465 is implicit TLS; 587 (KidCom's port) and 25 negotiate STARTTLS
      // themselves once connected — nodemailer's own `secure` flag is only
      // for the former, so basing it on the port keeps this correct for
      // either without needing its own env var.
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(message: { to: string; subject: string; text: string }): Promise<void> {
    await this.transport.sendMail({
      from: config.smtpFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

export const mailSender: MailSender = config.smtpHost
  ? new SmtpMailSender(config.smtpHost, config.smtpPort, config.smtpUser, config.smtpPass)
  : new ConsoleMailSender();
