import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getDatabase } from "@/db";
import { billingEvents, checkoutSessions, entitlements } from "@/db/schema";
import {
  attachSubscription,
  endSubscription,
  grantSubscriptionPeriod,
  isPaidTier,
  isTierKey,
  PLANS,
  type PlanKey,
  type TierKey,
  userForSubscription,
} from "@/lib/sylla/billing";

/**
 * Turning a verified payment into credits.
 *
 * Deliberately separate from `stripe.ts`: granting an entitlement is database
 * work that needs no payment secret, so it does not import the module holding
 * one. That keeps the secret in exactly one file and makes this half directly
 * testable.
 */

export type WebhookOutcome =
  | { handled: false; reason: "duplicate" | "ignored" }
  | { handled: true; planKey: PlanKey; creditsGranted: number }
  | {
      handled: true;
      tierKey: TierKey;
      creditsGranted: number;
      subscriptionEnded?: boolean;
    };

const HANDLED_TYPES = [
  "checkout.session.completed",
  "invoice.paid",
  "customer.subscription.deleted",
];

/** Record the event once, so a retry of any kind cannot apply twice. */
async function claimEvent(event: Stripe.Event) {
  const inserted = await getDatabase()
    .insert(billingEvents)
    .values({
      provider: "stripe",
      providerEventId: event.id,
      eventType: event.type,
      payloadHash: createHash("sha256").update(event.id).digest("hex"),
    })
    // The unique index is (provider, provider_event_id), so both columns have to
    // be named or Postgres finds no constraint to match.
    .onConflictDoNothing({
      target: [billingEvents.provider, billingEvents.providerEventId],
    })
    .returning({ id: billingEvents.id });
  return inserted.length > 0;
}

async function noteEventOwner(eventId: string, userId: string) {
  await getDatabase()
    .update(billingEvents)
    .set({ userId })
    .where(eq(billingEvents.providerEventId, eventId));
}

/**
 * A subscription renewed, including its very first period.
 *
 * Credits are granted here and nowhere else. Doing it on the checkout as well
 * would double-grant the first month, and doing it only on the checkout would
 * never grant the second — so the invoice, which arrives for every period
 * alike, is the single place that pays out.
 *
 * The tier and user ride on the subscription's own metadata, so this does not
 * depend on the checkout webhook having arrived first. Stripe does not promise
 * an order.
 */
async function applyInvoicePaid(event: Stripe.Event): Promise<WebhookOutcome> {
  const invoice = event.data.object as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
    subscription_details?: { metadata?: Record<string, string> | null } | null;
  };
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : (invoice.subscription?.id ?? null);
  if (!subscriptionId) return { handled: false, reason: "ignored" };

  const fromMetadata = invoice.subscription_details?.metadata ?? null;
  const linked = await userForSubscription(subscriptionId);
  const userId = fromMetadata?.syllaUserId ?? linked?.userId ?? null;
  const candidateTier = fromMetadata?.tierKey ?? linked?.tierKey ?? null;
  if (!userId || !isTierKey(candidateTier) || !isPaidTier(candidateTier)) {
    return { handled: false, reason: "ignored" };
  }

  const periodEnd =
    typeof invoice.period_end === "number"
      ? new Date(invoice.period_end * 1_000)
      : null;
  const creditsGranted = await grantSubscriptionPeriod({
    userId,
    tierKey: candidateTier,
    providerSubscriptionId: subscriptionId,
    periodEndsAt: periodEnd,
  });
  await noteEventOwner(event.id, userId);
  return { handled: true, tierKey: candidateTier, creditsGranted };
}

/** A subscription ended. The tier drops; nothing already paid for is taken. */
async function applySubscriptionDeleted(event: Stripe.Event): Promise<WebhookOutcome> {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = await endSubscription(subscription.id);
  if (!userId) return { handled: false, reason: "ignored" };
  await noteEventOwner(event.id, userId);
  return {
    handled: true,
    tierKey: "resident",
    creditsGranted: 0,
    subscriptionEnded: true,
  };
}

/**
 * Apply a verified event, exactly once.
 *
 * Stripe retries until it gets a 2xx, so the same event will arrive again. The
 * event id is a unique key in `billing_events`: a replay loses the insert race
 * and returns without granting a second time.
 */
export async function applyWebhookEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  if (!HANDLED_TYPES.includes(event.type)) {
    return { handled: false, reason: "ignored" };
  }
  if (!(await claimEvent(event))) return { handled: false, reason: "duplicate" };

  if (event.type === "invoice.paid") return applyInvoicePaid(event);
  if (event.type === "customer.subscription.deleted") {
    return applySubscriptionDeleted(event);
  }
  const session = event.data.object as Stripe.Checkout.Session & {
    subscription?: string | { id: string } | null;
  };
  const database = getDatabase();
  const token = session.client_reference_id;
  if (!token) return { handled: false, reason: "ignored" };

  // A subscription checkout settles the Sylla checkout row and links the
  // subscription, but grants nothing: the invoice pays out, for the first
  // period and every one after it alike.
  if (session.mode === "subscription") {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : (session.subscription?.id ?? null);
    const tierKey = session.metadata?.tierKey;
    const [claimed] = await database
      .update(checkoutSessions)
      .set({ status: "completed", completedAt: new Date() })
      .where(
        and(
          eq(
            checkoutSessions.tokenHash,
            createHash("sha256").update(token).digest("hex"),
          ),
          eq(checkoutSessions.status, "pending"),
        ),
      )
      .returning({ userId: checkoutSessions.userId });
    if (!claimed || !subscriptionId || !isTierKey(tierKey) || !isPaidTier(tierKey)) {
      return { handled: false, reason: claimed ? "ignored" : "duplicate" };
    }
    await attachSubscription({
      userId: claimed.userId,
      tierKey,
      providerSubscriptionId: subscriptionId,
    });
    await noteEventOwner(event.id, claimed.userId);
    return { handled: true, tierKey, creditsGranted: 0 };
  }

  if (session.payment_status !== "paid") {
    return { handled: false, reason: "ignored" };
  }

  const planKey = (session.metadata?.planKey ?? "starter") as PlanKey;
  const plan = PLANS[planKey] ?? PLANS.starter;

  const [checkout] = await database
    .update(checkoutSessions)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(checkoutSessions.tokenHash, createHash("sha256").update(token).digest("hex")),
        eq(checkoutSessions.status, "pending"),
      ),
    )
    .returning({ userId: checkoutSessions.userId });
  if (!checkout) return { handled: false, reason: "duplicate" };

  // Credits are added to whatever is left rather than replacing it: someone who
  // tops up early should not lose what they already paid for.
  const [existing] = await database
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, checkout.userId))
    .limit(1);

  if (existing) {
    await database
      .update(entitlements)
      .set({
        status: "active",
        planKey,
        creditLimit: existing.creditLimit + plan.credits,
      })
      .where(eq(entitlements.id, existing.id));
  } else {
    await database.insert(entitlements).values({
      userId: checkout.userId,
      status: "active",
      planKey,
      creditLimit: plan.credits,
    });
  }

  await noteEventOwner(event.id, checkout.userId);

  return { handled: true, planKey, creditsGranted: plan.credits };
}

