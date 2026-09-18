import "../env-config";

import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

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
  usageLedger,
  userSessions,
} from "../src/db/schema";
import { ensurePortableIdentity } from "../src/lib/sylla/identity";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";
import { createUserSession } from "../src/lib/sylla/session";

/**
 * A real purchase, end to end.
 *
 * Nothing here fakes a Stripe event. This stage prepares a genuine participant
 * and a genuine Sylla checkout token; the card is then entered on Stripe's own
 * hosted page, and Stripe signs and sends the resulting event itself. The
 * `check` stage only reads what that produced.
 *
 * Split into stages because the middle of it happens in a browser.
 */
const SLUG_PREFIX = "live-purchase-";

async function setup() {
  const database = getDatabase();
  const eventSlug = `${SLUG_PREFIX}${randomUUID()}`;
  const [event] = await database
    .insert(events)
    .values({
      slug: eventSlug,
      name: "Synthetic live purchase",
      status: "open",
      startsAt: new Date("2026-09-20T18:00:00.000Z"),
    })
    .returning();
  const invitation = await createEventInvitation({
    eventId: event.id,
    label: "Live purchase",
    maxUses: 1,
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
  });
  const { participantId } = await redeemEventInvitation(invitation.token);
  await acceptParticipationConsent(participantId, {
    displayName: "Synthetic live purchase",
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
  const session = await createUserSession(identity.userId);

  // The same shape the entitlement refusal path mints, so the checkout the
  // browser pays for is the one Sylla would really have handed out.
  const checkoutToken = randomBytes(32).toString("base64url");
  await database.insert(checkoutSessions).values({
    userId: identity.userId,
    tokenHash: createHash("sha256").update(checkoutToken).digest("hex"),
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
  });

  const [before] = await database
    .select({ creditLimit: entitlements.creditLimit })
    .from(entitlements)
    .where(eq(entitlements.userId, identity.userId))
    .limit(1);

  console.log(
    JSON.stringify({
      eventSlug,
      participantId,
      userId: identity.userId,
      checkoutToken,
      sessionToken: session.token,
      creditLimitBefore: before?.creditLimit ?? 0,
    }),
  );
}

async function check(userId: string, creditLimitBefore: number, expected: number) {
  const database = getDatabase();
  const [entitlement] = await database
    .select({
      creditLimit: entitlements.creditLimit,
      status: entitlements.status,
    })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .limit(1);
  assert.ok(entitlement, "no entitlement row was written");
  assert.equal(
    entitlement.creditLimit,
    creditLimitBefore + expected,
    "the credits Stripe paid for were not granted",
  );
  assert.equal(entitlement.status, "active");

  const [billing] = await database
    .select({
      providerEventId: billingEvents.providerEventId,
      eventType: billingEvents.eventType,
    })
    .from(billingEvents)
    .where(eq(billingEvents.userId, userId))
    .limit(1);
  assert.ok(billing, "no billing event was recorded");
  assert.ok(
    billing.providerEventId.startsWith("evt_"),
    "the recorded event id did not come from Stripe",
  );
  assert.equal(billing.eventType, "checkout.session.completed");

  const [checkout] = await database
    .select({ completedAt: checkoutSessions.completedAt })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.userId, userId))
    .limit(1);
  assert.ok(checkout?.completedAt, "the checkout was never marked complete");

  console.log(
    JSON.stringify({
      verified: true,
      stripeEventId: billing.providerEventId,
      creditLimit: entitlement.creditLimit,
      status: entitlement.status,
    }),
  );
}

async function cleanup(eventSlug: string, participantId: string, userId: string) {
  const database = getDatabase();
  await database.delete(usageLedger).where(eq(usageLedger.userId, userId));
  await database.delete(billingEvents).where(eq(billingEvents.userId, userId));
  await database.delete(checkoutSessions).where(eq(checkoutSessions.userId, userId));
  await database.delete(entitlements).where(eq(entitlements.userId, userId));
  await database.delete(userSessions).where(eq(userSessions.userId, userId));
  const [row] = await database
    .select({ agentId: participants.agentId })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  await database.delete(auditEvents).where(eq(auditEvents.participantId, participantId));
  await database.delete(participants).where(eq(participants.id, participantId));
  if (row?.agentId) {
    await database.delete(personalAgents).where(eq(personalAgents.id, row.agentId));
  }
  await database.delete(syllaUsers).where(eq(syllaUsers.id, userId));
  const [event] = await database
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, eventSlug))
    .limit(1);
  if (event) {
    await database.delete(auditEvents).where(eq(auditEvents.eventId, event.id));
  }
  await database.delete(events).where(eq(events.slug, eventSlug));
  console.log(JSON.stringify({ cleaned: true }));
}

const [stage, ...rest] = process.argv.slice(2);
const run =
  stage === "setup"
    ? setup()
    : stage === "check"
      ? check(rest[0], Number(rest[1]), Number(rest[2]))
      : stage === "cleanup"
        ? cleanup(rest[0], rest[1], rest[2])
        : Promise.reject(new Error("Usage: setup | check <userId> <before> <expected> | cleanup <slug> <participantId> <userId>"));

run.catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
