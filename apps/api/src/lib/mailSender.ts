import nodemailer from "nodemailer";

import { config } from "../config";

// Email-sending interface — same "swappable" treatment MediaStorage got in
// chunk 5. Two implementations below: a console-logging stub for local dev
// (no SMTP_* env vars set) and a real SMTP sender for production — the
// choice is made once, at module load, from config alone, so every call
// site (invites, verification emails, ...) stays identical in both
// environments.
export interface MailSender {
  send(message: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}

export class ConsoleMailSender implements MailSender {
  async send(message: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[mail] To: ${message.to}\nSubject: ${message.subject}${
        message.html ? " (html body available, showing plaintext fallback)" : ""
      }\n\n${message.text}`
    );
  }
}

// In-memory capture used only under `NODE_ENV=test` (see testUtils/setupEnv.ts) —
// lets integration tests assert on what a route tried to send (e.g. the D9
// receipt email's VAT breakdown) without a real SMTP server. `sent` grows for
// the life of the process; tests that care about isolation should slice from
// the length they observed at the start of the test, not assume it's empty.
export class MemoryMailSender implements MailSender {
  sent: { to: string; subject: string; text: string; html?: string }[] = [];

  async send(message: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    this.sent.push(message);
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

  async send(message: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    await this.transport.sendMail({
      from: config.smtpFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

export const mailSender: MailSender =
  config.nodeEnv === "test"
    ? new MemoryMailSender()
    : config.smtpHost
      ? new SmtpMailSender(config.smtpHost, config.smtpPort, config.smtpUser, config.smtpPass)
      : new ConsoleMailSender();

// Small shared helper for the two real HTML templates (emailTemplates/*) —
// wraps the raw brand SVG mark used in both mockups so it's defined once.
// Kept here rather than in each template file since both templates need the
// identical markup, inlined (no external image URL — mail clients block
// remote images by default, and Stitch's own mockup already inlines this
// same <svg> directly for that reason).
export const SPLITKID_BRAND_MARK_SVG = `<svg width="42" height="49" viewBox="0 0 109.89 128.84" xmlns="http://www.w3.org/2000/svg" style="display:block;width:42px;height:49px;"><path fill="#2d5a3f" d="M68.5,95.08c-.12,0-.25,0-.37,0-4.29-.17-7.3-3.16-7.15-7.1.1-2.56.05-14.3.01-26.19v-3.96c-1.51-.39-3.19-.58-5.06-.58-2.43,0-4.59.34-6.47,1.01v30.23c0,9.2-15.2,9.18-15.2,0v-7.75c0-3.51,0-10.42,2.59-16.52,1.7-4.01,4.27-7.06,7.59-9.08-.12-3.42-4.07-17.58-19.35-17.58-16.45,0-19.42,16.29-19.42,18.15-1.17,15.54,16.34,54.37,52.57,70.91-1.5.64.06,3.63-5.3,1.38s-31.07-16.36-47.55-49.08C2.04,71.55-.27,64.7.03,55.6c.1-3.16,1.55-12.26,9.32-18.12,3.92-2.96,9.14-4.92,15.75-4.92,15.59,0,23.36,11.88,24.23,20.51,3.54-.96,7.99-1.08,11.65-.37.18-15.32,17.23-24.29,24.1-24.01,15.9.65,24.82,12.45,24.82,24.67,0,44.5-52.37,75.12-52.37,75.12-1.51.95-4.66-.51-4.66-.51,38.3-29.12,53.77-52.09,51.5-74.76,0-7.45-4.65-19.94-19.01-19.94s-19.37,12.5-19.37,19.94v1.17c1.63.82,3.08,1.87,4.35,3.15,6.39,6.45,6.3,17.04,6.26,22.14v1.09c0,2.35,0,5.45.02,7.53.03,3.69.05-2.12-.03-.11-.19,4.54-4.24,6.9-8.08,6.9ZM65.99,60.34v1.44c.04,12.7.09,23.73-.02,26.39-.06,1.57,1.44,1.87,2.35,1.9,1.23.06,3.18-1.32,3.25-2.95.08-1.89.06,3.97.03.35-.01-2.09-.03-4.37-.03-6.72v-1.13c.05-4.75.13-13.6-4.8-18.57-.25-.25-.51-.49-.78-.72ZM44.46,61.5c-1.21,1.27-2.2,2.83-2.99,4.69-2.2,5.17-2.19,11.15-2.19,14.37v7.64c0,1.94,2.33,1.99,2.6,1.99.43,0,2.59-.1,2.59-1.99v-26.69Z"/><path fill="#2d5a3f" d="M24.6,30.29c-7.28,0-13.21-5.93-13.21-13.21S17.32,3.87,24.6,3.87s13.21,5.93,13.21,13.21-5.93,13.21-13.21,13.21ZM24.6,8.87c-4.52,0-8.2,3.68-8.2,8.2s3.68,8.2,8.2,8.2,8.2-3.68,8.2-8.2-3.68-8.2-8.2-8.2Z"/><path fill="#2d5a3f" d="M55.01,50.79c-7.28,0-13.21-5.93-13.21-13.21s5.93-13.21,13.21-13.21,13.21,5.93,13.21,13.21-5.93,13.21-13.21,13.21ZM55.01,29.37c-4.52,0-8.2,3.68-8.2,8.2s3.68,8.2,8.2,8.2,8.2-3.68,8.2-8.2-3.68-8.2-8.2-8.2Z"/><path fill="#2d5a3f" d="M85.07,26.42c-7.28,0-13.21-5.93-13.21-13.21S77.79,0,85.07,0s13.21,5.93,13.21,13.21-5.93,13.21-13.21,13.21ZM85.07,5.01c-4.52,0-8.2,3.68-8.2,8.2s3.68,8.2,8.2,8.2,8.2-3.68,8.2-8.2-3.68-8.2-8.2-8.2Z"/></svg>`;
