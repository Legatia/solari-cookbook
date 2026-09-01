import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  authIdentities,
  events,
  hostConnections,
  participants,
  personalAgents,
  runtimeLeases,
  syllaUsers,
} from "../src/db/schema";
import {
  createEventInvitation,
  InvitationUnavailableError,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import { acquireRuntimeLease } from "../src/lib/sylla/leases";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
  withdrawParticipation,
} from "../src/lib/sylla/participation";
import { loadSessionState } from "../src/lib/sylla/session";

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `participation-${syntheticId}`;
  let participantId: string | undefined;
  let userId: string | undefined;
  let agentId: string | undefined;
  let eventId: string | undefined;

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: eventSlug,
        name: "Synthetic consent event",
        status: "open",
        startsAt: new Date("2026-09-10T18:00:00.000Z"),
      })
      .returning();
    eventId = event.id;
    const invitation = await createEventInvitation({
      eventId,
      label: "Synthetic single-use invitation",
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    const redeemed = await redeemEventInvitation(invitation.token);
    participantId = redeemed.participantId;
    await assert.rejects(
      redeemEventInvitation(invitation.token),
      InvitationUnavailableError,
    );

    const beforeConsent = await loadSessionState(participantId);
    assert.equal(beforeConsent.stage, "consent");
    assert.equal(beforeConsent.event.name, "Synthetic consent event");
    const consented = await acceptParticipationConsent(participantId, {
      displayName: "Synthetic Tobias",
      policyVersion: PARTICIPATION_POLICY_VERSION,
      ageConfirmed: true,
      publicSourceResearch: true,
      privateMemoryStorage: true,
      matchmaking: true,
      hostDataBoundary: true,
      backgroundContinuation: true,
      availability: [
        {
          startsAt: "2026-09-10T18:00:00.000Z",
          endsAt: "2026-09-10T20:00:00.000Z",
          timezone: "Europe/Warsaw",
        },
      ],
    });
    assert.equal(consented.stage, "new");
    assert.equal(consented.participation.policyVersion, PARTICIPATION_POLICY_VERSION);
    assert.equal(consented.participation.availability.length, 1);
    assert.equal(consented.participation.backgroundContinuationAllowed, true);

    const [identity] = await database
      .select({ userId: participants.userId, agentId: participants.agentId })
      .from(participants)
      .where(eq(participants.id, participantId))
      .limit(1);
    userId = identity?.userId ?? undefined;
    agentId = identity?.agentId ?? undefined;
    assert.ok(userId);
    assert.ok(agentId);
    const [authIdentity] = await database
      .insert(authIdentities)
      .values({
        userId,
        provider: "synthetic",
        providerSubject: `subject-${syntheticId}`,
      })
      .returning();
    const [connection] = await database
      .insert(hostConnections)
      .values({
        userId,
        authIdentityId: authIdentity.id,
        clientId: "synthetic-host",
        scopes: ["sylla:agent"],
      })
      .returning();
    const lease = await acquireRuntimeLease({
      participantId,
      clientId: "synthetic-host",
      runId: `participation-run-${syntheticId}`,
      purpose: "Verify withdrawal revocation",
      durationSeconds: 60,
    });

    const withdrawn = await withdrawParticipation(participantId);
    assert.equal(withdrawn.stage, "withdrawn");
    assert.ok(withdrawn.participation.withdrawnAt);
    const [revokedConnection] = await database
      .select()
      .from(hostConnections)
      .where(eq(hostConnections.id, connection.id))
      .limit(1);
    assert.ok(revokedConnection?.revokedAt);
    const [releasedLease] = await database
      .select()
      .from(runtimeLeases)
      .where(eq(runtimeLeases.id, lease.leaseId))
      .limit(1);
    assert.ok(releasedLease?.releasedAt);
    const auditRows = await database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.participantId, participantId));
    assert.deepEqual(
      auditRows.map((row) => row.action).sort(),
      [
        "event_invitation_redeemed",
        "participation_consented",
        "participation_withdrawn",
      ].sort(),
    );
    assert.equal(
      auditRows.some((row) => JSON.stringify(row.metadata).includes("Synthetic Tobias")),
      false,
    );

    console.log(
      JSON.stringify({
        verified: true,
        singleUseInvitationEnforced: true,
        explicitPolicyVersion: PARTICIPATION_POLICY_VERSION,
        availabilityPersisted: true,
        withdrawalReleasedLease: true,
        withdrawalRevokedHost: true,
        auditActions: auditRows.map((row) => row.action).sort(),
      }),
    );
  } finally {
    if (participantId) {
      await database
        .delete(auditEvents)
        .where(eq(auditEvents.participantId, participantId));
      await database.delete(participants).where(eq(participants.id, participantId));
    }
    if (agentId) {
      await database.delete(personalAgents).where(eq(personalAgents.id, agentId));
    }
    if (userId) {
      await database.delete(syllaUsers).where(eq(syllaUsers.id, userId));
    }
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
