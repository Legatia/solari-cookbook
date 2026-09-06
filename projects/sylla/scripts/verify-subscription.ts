import "../env-config";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  billingEvents,
  checkoutSessions,
  entitlements,
  events,
  participants,
  personalAgents,
  syllaUsers,
  userSessions,
} from "../src/db/schema";
import { applyWebhookEvent } from "../src/lib/sylla/billing-events";
import { getBillingSummary, TIERS } from "../src/lib/sylla/billing";
import { ensurePortableIdentity } from "../src/lib/sylla/identity";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";

/**
 * The tiers, from first payment to cancellation.
 *
 * The failure that matters is double-granting: the first month arrives as both
 * a completed checkout and a paid invoice, and paying out on both would hand
 * over two months for one payment. Only the invoice pays.
 */
const SUBSCRIPTION = "sub_synthetic_verification";

function checkoutCompleted(id: string, token: string, tierKey: string) {
  return {
    id,
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "subscription",
        payment_status: "paid",
        client_reference_id: token,
        subscription: SUBSCRIPTION,
        metadata: { tierKey },
      },
    },
  } as never;
}

function invoicePaid(id: string, tierKey: string, userId: string, periodEnd: number) {
  return {
    id,
    type: "invoice.paid",
    data: {
      object: {
        subscription: SUBSCRIPTION,
        period_end: periodEnd,
        subscription_details: { metadata: { syllaUserId: userId, tierKey } },
      },
    },
  } as never;
}

function subscriptionDeleted(id: string) {
  return {
    id,
    type: "customer.subscription.deleted",
    data: { object: { id: SUBSCRIPTION } },
  } as never;
}

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `subscription-${syntheticId}`;
  let participantId: string | undefined;
  const observed: Record<string, unknown> = {};

  try {
    const [event] = await database
      .insert(events)
      .values({ slug: eventSlug, name: "Synthetic subscription", status: "open" })
      .returning();
    const invitation = await createEventInvitation({
      eventId: event.id,
      label: "Subscription",
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    ({ participantId } = await redeemEventInvitation(invitation.token));
    await acceptParticipationConsent(participantId, {
      displayName: "Synthetic subscriber",
      policyVersion: PARTICIPATION_POLICY_VERSION,
      ageConfirmed: true,
      publicSourceResearch: true,
      privateMemoryStorage: true,
      matchmaking: false,
      hostDataBoundary: true,
      backgroundContinuation: false,
      availability: [],
    });
    const identity = await ensurePortableIdentity(participantId);

    // Everyone starts on the free floor.
    const start = await getBillingSummary(participantId);
    assert.equal(start.tierKey, "resident");
    assert.equal(start.societyIncluded, true);
    observed.everyoneStartsResident = true;
    const trialCredits = start.creditLimit;

    const token = `tok_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
    await database.insert(checkoutSessions).values({
      userId: identity.userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      planKey: "working",
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });

    // The checkout links the subscription and grants nothing.
    const linked = await applyWebhookEvent(
      checkoutCompleted(`evt_checkout_${syntheticId}`, token, "working"),
    );
    assert.equal(linked.handled, true);
    assert.equal(linked.handled && linked.creditsGranted, 0);
    const afterLink = await getBillingSummary(participantId);
    assert.equal(afterLink.tierKey, "working");
    assert.equal(
      afterLink.creditLimit,
      trialCredits,
      "linking a subscription must not hand out a month",
    );
    observed.checkoutLinksButDoesNotPay = true;

    // The invoice pays, for the first period like any other.
    const periodEnd = Math.floor(Date.now() / 1_000) + 30 * 24 * 60 * 60;
    const first = await applyWebhookEvent(
      invoicePaid(`evt_inv1_${syntheticId}`, "working", identity.userId, periodEnd),
    );
    assert.equal(first.handled && first.creditsGranted, TIERS.working.monthlyCredits);
    const afterFirst = await getBillingSummary(participantId);
    assert.equal(afterFirst.creditLimit, trialCredits + TIERS.working.monthlyCredits);
    assert.equal(afterFirst.renewsAt, new Date(periodEnd * 1_000).toISOString());
    observed.firstMonthPaidExactlyOnce = true;

    // Stripe retries. The same invoice must not pay twice.
    const replay = await applyWebhookEvent(
      invoicePaid(`evt_inv1_${syntheticId}`, "working", identity.userId, periodEnd),
    );
    assert.equal(replay.handled, false);
    assert.equal(replay.handled === false && replay.reason, "duplicate");
    assert.equal(
      (await getBillingSummary(participantId)).creditLimit,
      trialCredits + TIERS.working.monthlyCredits,
    );
    observed.retriesDoNotPayTwice = true;

    // Next month adds to what is left rather than replacing it.
    const second = await applyWebhookEvent(
      invoicePaid(`evt_inv2_${syntheticId}`, "working", identity.userId, periodEnd),
    );
    assert.equal(second.handled && second.creditsGranted, TIERS.working.monthlyCredits);
    assert.equal(
      (await getBillingSummary(participantId)).creditLimit,
      trialCredits + TIERS.working.monthlyCredits * 2,
      "unused credits carry over instead of expiring",
    );
    observed.unusedCreditsRollOver = true;

    // Cancelling drops the tier and takes nothing away.
    const before = await getBillingSummary(participantId);
    const ended = await applyWebhookEvent(subscriptionDeleted(`evt_del_${syntheticId}`));
    assert.equal(ended.handled, true);
    const after = await getBillingSummary(participantId);
    assert.equal(after.tierKey, "resident");
    assert.equal(
      after.creditLimit,
      before.creditLimit,
      "credits already paid for survive cancellation",
    );
    assert.equal(after.societyIncluded, true, "the society was never conditional");
    observed.cancellingKeepsWhatWasPaidFor = true;

    // A renewal for a subscription nobody holds must not invent an account.
    const orphan = await applyWebhookEvent(
      invoicePaid(`evt_orphan_${syntheticId}`, "working", "", periodEnd),
    );
    assert.equal(orphan.handled, false);
    observed.unknownSubscriptionsGrantNothing = true;

    console.log(JSON.stringify({ verified: true, ...observed }));
  } finally {
    if (participantId) {
      const [row] = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);
      if (row?.userId) {
        await database.delete(billingEvents).where(eq(billingEvents.userId, row.userId));
        await database
          .delete(checkoutSessions)
          .where(eq(checkoutSessions.userId, row.userId));
        await database.delete(entitlements).where(eq(entitlements.userId, row.userId));
        await database.delete(userSessions).where(eq(userSessions.userId, row.userId));
      }
      await database
        .delete(auditEvents)
        .where(eq(auditEvents.participantId, participantId));
      await database.delete(participants).where(eq(participants.id, participantId));
      if (row?.agentId) {
        await database.delete(personalAgents).where(eq(personalAgents.id, row.agentId));
      }
      if (row?.userId) {
        await database.delete(syllaUsers).where(eq(syllaUsers.id, row.userId));
      }
    }
    await database.delete(events).where(eq(events.slug, eventSlug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
