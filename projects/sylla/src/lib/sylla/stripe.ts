import "server-only";

import { eq } from "drizzle-orm";
import Stripe from "stripe";

import { getDatabase } from "@/db";
import { syllaUsers } from "@/db/schema";
import { PLANS, type PlanKey } from "@/lib/sylla/billing";

/**
 * Payment, kept outside the conversation.
 *
 * Card details never enter an MCP tool argument or a model transcript: the
 * agent can start a checkout and report a plan, and the participant pays on a
 * hosted Stripe page. Entitlement is granted by a signed webhook rather than by
 * the browser coming back, because a redirect is a claim and a signature is
 * evidence.
 */

let cached: Stripe | null = null;

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  if (!cached) cached = new Stripe(key);
  return cached;
}

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured for this deployment.");
  }
}

export function stripeIsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Turn a pending Sylla checkout into a hosted Stripe page.
 *
 * The Sylla token is carried as `client_reference_id` so the webhook can find
 * the row again without trusting anything the browser sends back.
 */
export async function createHostedCheckout(input: {
  checkoutToken: string;
  planKey: PlanKey;
  userId: string;
}) {
  const plan = PLANS[input.planKey];
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: input.checkoutToken,
    metadata: { syllaUserId: input.userId, planKey: input.planKey },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: plan.priceInCents,
          product_data: {
            name: plan.name,
            description: `${plan.credits.toLocaleString()} work credits for your Sylla agent.`,
          },
        },
      },
    ],
    success_url: `${appBaseUrl()}/checkout/${input.checkoutToken}?paid=1`,
    cancel_url: `${appBaseUrl()}/checkout/${input.checkoutToken}?cancelled=1`,
  });
  if (!session.url) throw new Error("Stripe returned a checkout without a URL.");
  return { url: session.url, sessionId: session.id };
}

export class WebhookVerificationError extends Error {}

/**
 * Verify a webhook came from Stripe.
 *
 * Without the signature check this endpoint is an unauthenticated
 * "grant me credits" API, so a missing secret is a hard failure rather than a
 * degraded mode.
 */
export function verifyWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new WebhookVerificationError(
      "STRIPE_WEBHOOK_SECRET is not set; refusing to trust an unsigned webhook.",
    );
  }
  if (!signature) {
    throw new WebhookVerificationError("This request carried no Stripe signature.");
  }
  try {
    return stripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    throw new WebhookVerificationError(
      error instanceof Error ? error.message : "The Stripe signature did not verify.",
    );
  }
}

export async function userExists(userId: string) {
  const [row] = await getDatabase()
    .select({ id: syllaUsers.id })
    .from(syllaUsers)
    .where(eq(syllaUsers.id, userId))
    .limit(1);
  return Boolean(row);
}
