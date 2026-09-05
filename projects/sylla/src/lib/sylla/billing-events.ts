import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getDatabase } from "@/db";
import { billingEvents, checkoutSessions, entitlements } from "@/db/schema";
import { PLANS, type PlanKey } from "@/lib/sylla/billing";

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
  | { handled: true; planKey: PlanKey; creditsGranted: number };

/**
 * Apply a verified event, exactly once.
 *
 * Stripe retries until it gets a 2xx, so the same event will arrive again. The
 * event id is a unique key in `billing_events`: a replay loses the insert race
 * and returns without granting a second time.
 */
export async function applyWebhookEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  if (event.type !== "checkout.session.completed") {
    return { handled: false, reason: "ignored" };
  }
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return { handled: false, reason: "ignored" };
  }

  const database = getDatabase();
  const inserted = await database
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
  if (!inserted.length) return { handled: false, reason: "duplicate" };

  const token = session.client_reference_id;
  const planKey = (session.metadata?.planKey ?? "starter") as PlanKey;
  const plan = PLANS[planKey] ?? PLANS.starter;
  if (!token) return { handled: false, reason: "ignored" };

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

  await database
    .update(billingEvents)
    .set({ userId: checkout.userId })
    .where(eq(billingEvents.providerEventId, event.id));

  return { handled: true, planKey, creditsGranted: plan.credits };
}

