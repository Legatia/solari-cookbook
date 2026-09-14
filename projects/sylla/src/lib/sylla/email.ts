import "server-only";

/**
 * Sending mail, and nothing else.
 *
 * Kept separate from the policy about *when* to send so the provider secret
 * lives in one file, the same split the payment code uses.
 */

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 8_000;

export class EmailNotConfiguredError extends Error {}
export class EmailSendError extends Error {}

export function emailIsConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.SYLLA_EMAIL_FROM);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  /** Shown to mail clients as the one-click way out. */
  unsubscribeUrl?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SYLLA_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new EmailNotConfiguredError(
      "RESEND_API_KEY and SYLLA_EMAIL_FROM must be set before Sylla can send mail.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // The provider's own message is the only thing that separates a bad key
    // from an unverified sending domain from a rejected recipient.
    throw new EmailSendError(
      `Mail provider returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  return { sent: true };
}
