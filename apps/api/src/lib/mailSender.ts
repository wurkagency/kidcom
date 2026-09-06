// Email-sending interface — same "swappable" treatment MediaStorage got in
// chunk 5. No real provider is wired up yet (see chunk 7 plan notes): this
// keeps the invite/billing-receipt call sites stable so a real SMTP/Resend/
// Postmark implementation can be dropped in later without touching them.
export interface MailSender {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export class ConsoleMailSender implements MailSender {
  async send(message: { to: string; subject: string; text: string }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[mail] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
  }
}

export const mailSender: MailSender = new ConsoleMailSender();
