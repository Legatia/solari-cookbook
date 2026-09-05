import "../env-config";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  billingEvents,
  checkoutSessions,
  cronRuns,
  entitlements,
  events,
  participants,
  personalAgents,
  recoveryCodes,
  syllaUsers,
  userSessions,
} from "../src/db/schema";
import { beginCronRun, cronHealth, finishCronRun } from "../src/lib/sylla/cron-health";
import {
  issueRecoveryCodes,
  recoveryCodeStatus,
  redeemRecoveryCode,
  RecoveryError,
} from "../src/lib/sylla/recovery";
import { applyWebhookEvent } from "../src/lib/sylla/billing-events";
import { ensurePortableIdentity } from "../src/lib/sylla/identity";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";

/** A verified Stripe event, minus the signature the webhook route checks. */
function checkoutCompleted(id: string, token: string, planKey: string) {
  return {
    id,
    type: "checkout.session.completed",
    data: {
      object: {
        payment_status: "paid",
        client_reference_id: token,
        metadata: { planKey },
      },
    },
  } as never;
}

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `phase-one-${syntheticId}`;
  let participantId: string | undefined;
  let eventId: string | undefined;
  const observed: Record<string, unknown> = {};

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: eventSlug,
        name: "Synthetic phase one event",
        status: "open",
        startsAt: new Date("2026-09-10T18:00:00.000Z"),
      })
      .returning();
    eventId = event.id;
    const invitation = await createEventInvitation({
      eventId,
      label: "Phase one",
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    ({ participantId } = await redeemEventInvitation(invitation.token));
    await acceptParticipationConsent(participantId, {
      displayName: "Synthetic phase one",
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

    // ---- Recovery ----------------------------------------------------------
    const issued = await issueRecoveryCodes(participantId);
    assert.equal(issued.codes.length, 8);
    assert.equal((await recoveryCodeStatus(participantId)).remaining, 8);

    const stored = await database
      .select({ codeHash: recoveryCodes.codeHash })
      .from(recoveryCodes)
      .where(eq(recoveryCodes.userId, identity.userId));
    assert.ok(
      !JSON.stringify(stored).includes(issued.codes[0].replace(/-/g, "")),
      "codes are hashed, never stored in clear",
    );

    // Reissuing must kill the old set, or a leaked list stays live forever.
    const reissued = await issueRecoveryCodes(participantId);
    await assert.rejects(
      redeemRecoveryCode(issued.codes[0]),
      RecoveryError,
      "a superseded code must stop working",
    );
    observed.reissueInvalidatesOldCodes = true;

    const session = await redeemRecoveryCode(reissued.codes[0]);
    assert.equal(session.participant.id, participantId, "recovers the same agent");
    await assert.rejects(
      redeemRecoveryCode(reissued.codes[0]),
      RecoveryError,
      "a code is single use",
    );
    assert.equal((await recoveryCodeStatus(participantId)).remaining, 7);
    await assert.rejects(redeemRecoveryCode("ZZZZ-ZZZZ-ZZZZ"), RecoveryError);
    observed.recoveredWithoutAnyDevice = true;

    // ---- Payment -----------------------------------------------------------
    const token = `tok_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
    await database.insert(checkoutSessions).values({
      userId: identity.userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      planKey: "starter",
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });

    const before = await database
      .select({ creditLimit: entitlements.creditLimit })
      .from(entitlements)
      .where(eq(entitlements.userId, identity.userId))
      .limit(1);
    const startingLimit = before[0]?.creditLimit ?? 0;

    const eventId1 = `evt_${syntheticId}`;
    const first = await applyWebhookEvent(checkoutCompleted(eventId1, token, "starter"));
    assert.equal(first.handled, true);
    assert.equal(first.handled && first.creditsGranted, 2_000);

    // Stripe retries until it gets a 2xx, so the same event will arrive again.
    const replay = await applyWebhookEvent(checkoutCompleted(eventId1, token, "starter"));
    assert.equal(replay.handled, false);
    assert.equal(replay.handled === false && replay.reason, "duplicate");
    observed.webhookRepliesAreIdempotent = true;

    const [after] = await database
      .select({ creditLimit: entitlements.creditLimit, status: entitlements.status })
      .from(entitlements)
      .where(eq(entitlements.userId, identity.userId))
      .limit(1);
    assert.equal(
      after.creditLimit,
      startingLimit + 2_000,
      "credits are added once, not twice",
    );
    assert.equal(after.status, "active");
    observed.creditsGrantedOnceOnly = true;

    // A different event id against a checkout already completed must also not
    // grant again: the guard is the checkout row, not only the event id.
    const secondEvent = await applyWebhookEvent(
      checkoutCompleted(`evt_other_${syntheticId}`, token, "regular"),
    );
    assert.equal(secondEvent.handled, false);
    observed.completedCheckoutCannotBeReused = true;

    // ---- Scheduler monitoring ---------------------------------------------
    const runId = await beginCronRun("fallback-sweep");
    const midRun = await cronHealth("fallback-sweep");
    assert.equal(midRun.neverRun, false);
    assert.equal(midRun.stale, false, "a sweep in progress is not stale");
    await finishCronRun(runId, { ok: true, executed: 1, skipped: 0, failed: 0 });
    const healthy = await cronHealth("fallback-sweep");
    assert.equal(healthy.lastOk, true);
    assert.equal(healthy.stale, false);
    observed.sweepRecorded = true;

    // Backdate the run: a scheduler that stopped firing produces silence, and
    // silence is what this endpoint exists to turn into an alert.
    await database
      .update(cronRuns)
      .set({
        startedAt: new Date(Date.now() - 48 * 60 * 60 * 1_000),
        finishedAt: new Date(Date.now() - 48 * 60 * 60 * 1_000),
      })
      .where(eq(cronRuns.id, runId));
    const quiet = await cronHealth("fallback-sweep");
    assert.equal(quiet.stale, true, "a silent scheduler must read as unhealthy");
    observed.silenceReadsAsUnhealthy = true;

    const [latest] = await database
      .select({ job: cronRuns.job })
      .from(cronRuns)
      .orderBy(desc(cronRuns.startedAt))
      .limit(1);
    assert.equal(latest.job, "fallback-sweep");

    console.log(JSON.stringify({ verified: true, ...observed }));
  } finally {
    if (participantId) {
      const [row] = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);
      if (row?.userId) {
        await database.delete(recoveryCodes).where(eq(recoveryCodes.userId, row.userId));
        await database
          .delete(checkoutSessions)
          .where(eq(checkoutSessions.userId, row.userId));
        await database.delete(billingEvents).where(eq(billingEvents.userId, row.userId));
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
    await database.delete(cronRuns).where(eq(cronRuns.job, "fallback-sweep"));
    if (eventId) {
      await database.delete(auditEvents).where(eq(auditEvents.eventId, eventId));
    }
    await database.delete(events).where(eq(events.slug, eventSlug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
