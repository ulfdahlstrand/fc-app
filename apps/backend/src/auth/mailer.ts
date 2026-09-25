/**
 * Sending the few emails sign-in needs (ADR-024).
 *
 * Resend over plain `fetch` when RESEND_API_KEY is set. Without it, outside
 * production, the message is printed to the console so the flows can be
 * followed locally with no account anywhere; in production a missing key is an
 * error, because a verification link nobody receives is a locked door.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Whether sign-in mail can reach anyone: Resend fully configured, or a
 * non-production process that prints mail to its console. This is the switch
 * for email and password sign-in as a whole — without mail, a signup could
 * never be confirmed nor a password reset, so neither is offered.
 */
export function canSendMail(): boolean {
  if (process.env["NODE_ENV"] !== "production") return true;
  return Boolean(process.env["RESEND_API_KEY"] && process.env["MAIL_FROM"]);
}

export const sendMail: Mailer = async (mail) => {
  const apiKey = process.env["RESEND_API_KEY"];

  if (!apiKey) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("[mail] RESEND_API_KEY is not set; cannot send email");
    }
    console.info(
      `[mail] (not sent — no RESEND_API_KEY)\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`
    );
    return;
  }

  const from = process.env["MAIL_FROM"];
  if (!from) {
    throw new Error("[mail] MAIL_FROM is not set; cannot send email");
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });

  if (!response.ok) {
    // The body names the problem (unverified domain, bad key); the recipient
    // is left out of the log.
    throw new Error(
      `[mail] Resend refused the message (${response.status}): ${await response.text()}`
    );
  }
};
