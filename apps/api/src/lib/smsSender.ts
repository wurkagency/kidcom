import { config } from "../config";

// SMS-sending interface, same swappable shape as mailSender.ts: a console
// logger for local dev, an in-memory capture for tests, and Brevo's
// transactional SMS API for real delivery. Chosen once at module load.
//
// Real SMS costs credits, so local dev logs by default even with a Brevo key
// present; set SMS_DELIVERY=brevo to send real messages from a dev machine.
export interface SmsSender {
  send(message: { to: string; content: string }): Promise<void>;
}

export class ConsoleSmsSender implements SmsSender {
  async send(message: { to: string; content: string }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[sms] To: ${message.to}\n${message.content}`);
  }
}

export class MemorySmsSender implements SmsSender {
  sent: { to: string; content: string }[] = [];
  async send(message: { to: string; content: string }): Promise<void> {
    this.sent.push(message);
  }
}

export class BrevoSmsSender implements SmsSender {
  constructor(
    private readonly apiKey: string,
    private readonly sender: string,
  ) {}

  async send(message: { to: string; content: string }): Promise<void> {
    const res = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: this.sender,
        // Brevo wants the international number without the leading "+".
        recipient: message.to.replace(/^\+/, ""),
        content: message.content,
        type: "transactional",
        tag: "kidcom-auth",
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Brevo SMS failed (${res.status}): ${detail.slice(0, 300)}`);
    }
  }
}

function createSmsSender(): SmsSender {
  if (config.nodeEnv === "test") return new MemorySmsSender();
  if (config.smsDelivery === "brevo") {
    if (!config.brevoApiKey || !config.brevoSmsSender) {
      throw new Error("SMS_DELIVERY=brevo requires BREVO_API_KEY and BREVO_SMS_SENDER");
    }
    return new BrevoSmsSender(config.brevoApiKey, config.brevoSmsSender);
  }
  return new ConsoleSmsSender();
}

export const smsSender: SmsSender = createSmsSender();
