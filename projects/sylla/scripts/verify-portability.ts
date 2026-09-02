import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  agentConversationProfiles,
  auditEvents,
  events,
  observations,
  participants,
  personalAgents,
  personalMemories,
  syllaUsers,
} from "../src/db/schema";
import { updateConversationProfile } from "../src/lib/sylla/conversation";
import { ensurePortableIdentity } from "../src/lib/sylla/identity";
import { acquireRuntimeLease } from "../src/lib/sylla/leases";
import {
  buildPortableAgentExport,
  deletePortableAgent,
} from "../src/lib/sylla/portability";
import { loadSessionState } from "../src/lib/sylla/session";

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventIds: string[] = [];
  const participantIds: string[] = [];
  let userId: string | undefined;
  let agentId: string | undefined;

  try {
    for (const index of [1, 2]) {
      const [event] = await database
        .insert(events)
        .values({
          slug: `portability-${syntheticId}-${index}`,
          name: `Portable agent event ${index}`,
          status: "open",
        })
        .returning();
      eventIds.push(event.id);
      const [participant] = await database
        .insert(participants)
        .values({
          eventId: event.id,
          inviteTokenHash: `portability-${syntheticId}-${index}`,
          displayName: "Portable person",
          agentName: "Mira",
          intent: "Remember what makes conversations worthwhile",
          status: "ready",
        })
        .returning();
      participantIds.push(participant.id);
    }

    const firstIdentity = await ensurePortableIdentity(participantIds[0]!);
    userId = firstIdentity.userId;
    agentId = firstIdentity.agentId;
    await database
      .update(participants)
      .set({ userId, agentId })
      .where(eq(participants.id, participantIds[1]!));
    await updateConversationProfile(participantIds[0]!, {
      responseLength: "terse",
      directness: 5,
      humor: "dry",
      preferredBehaviors: ["Lead with the actual recommendation"],
      avoidedBehaviors: ["End every response with an offer"],
    });

    await database.insert(observations).values([
      {
        participantId: participantIds[0]!,
        claim: "Values small, focused conversations.",
        origin: "told_to_me",
        status: "confirmed",
        visibility: "private",
        confidence: "high",
      },
      {
        participantId: participantIds[1]!,
        claim: "Enjoys recurring community gatherings.",
        origin: "observed",
        status: "edited",
        visibility: "shareable",
        confidence: "high",
      },
      {
        participantId: participantIds[1]!,
        claim: "This pending proposal must not be exported as memory.",
        origin: "inferred",
        status: "pending",
        visibility: "private",
        confidence: "low",
      },
    ]);
    await database.insert(personalMemories).values([
      {
        participantId: participantIds[1]!,
        summary: "I prefer one thoughtful introduction at a time.",
        status: "approved",
        visibility: "private",
        approvedAt: new Date(),
      },
      {
        participantId: participantIds[0]!,
        summary: "This unapproved proposal must stay out of an export.",
        status: "proposed",
        visibility: "private",
      },
    ]);
    await database.insert(auditEvents).values({
      eventId: eventIds[0],
      participantId: participantIds[0],
      actorType: "participant",
      action: "synthetic_portability_event",
      entityType: "participant",
      entityId: participantIds[0],
      metadata: {},
    });

    const portableState = await loadSessionState(participantIds[0]!);
    assert.equal(portableState.observations.length, 3);
    assert.equal(portableState.personalMemories.length, 2);
    const exported = await buildPortableAgentExport(participantIds[0]!);
    assert.equal(exported.identity.userId, userId);
    assert.equal(exported.identity.agentId, agentId);
    assert.equal(exported.participationRefs.length, 2);
    assert.equal(exported.approvedObservations.length, 2);
    assert.equal(exported.approvedPersonalMemories.length, 1);
    assert.equal(exported.conversationProfile.responseLength, "terse");
    assert.equal(exported.conversationProfile.directness, 5);
    assert.equal(exported.conversationProfile.humor, "dry");
    assert.equal(exported.privacy.rawDebriefIncluded, false);
    assert.equal(JSON.stringify(exported).includes("unapproved proposal"), false);

    const lease = await acquireRuntimeLease({
      participantId: participantIds[0]!,
      clientId: "chatgpt-portability-test",
      runId: `delete-${syntheticId}`,
      purpose: "Verify complete portable-agent deletion",
    });
    const deletion = await deletePortableAgent({
      participantId: participantIds[0]!,
      authorization: lease,
      confirmation: "DELETE MY SYLLA AGENT",
    });
    assert.equal(deletion.deleted, true);
    assert.equal(deletion.participantRecordsDeleted, 2);
    assert.equal(deletion.recoverableBySylla, false);

    const [
      remainingParticipants,
      remainingUsers,
      remainingAgents,
      remainingConversationProfiles,
      remainingAudit,
    ] =
      await Promise.all([
        database
          .select({ id: participants.id })
          .from(participants)
          .where(inArray(participants.id, participantIds)),
        database
          .select({ id: syllaUsers.id })
          .from(syllaUsers)
          .where(eq(syllaUsers.id, userId)),
        database
          .select({ id: personalAgents.id })
          .from(personalAgents)
          .where(eq(personalAgents.id, agentId)),
        database
          .select({ id: agentConversationProfiles.id })
          .from(agentConversationProfiles)
          .where(eq(agentConversationProfiles.agentId, agentId)),
        database
          .select({ id: auditEvents.id })
          .from(auditEvents)
          .where(inArray(auditEvents.participantId, participantIds)),
      ]);
    assert.equal(remainingParticipants.length, 0);
    assert.equal(remainingUsers.length, 0);
    assert.equal(remainingAgents.length, 0);
    assert.equal(remainingConversationProfiles.length, 0);
    assert.equal(remainingAudit.length, 0);

    console.log(
      JSON.stringify({
        verified: true,
        crossEventParticipantRecordsExported: exported.participationRefs.length,
        approvedObservationsExported: exported.approvedObservations.length,
        approvedPersonalMemoriesExported:
          exported.approvedPersonalMemories.length,
        conversationProfilePortable: true,
        crossEventStateLoadedIntoWorkspaceContract: true,
        pendingMemoryExcluded: true,
        rawDebriefIncluded: false,
        canonicalAccountDeleted: true,
        syllaRecoverable: false,
      }),
    );
  } finally {
    if (participantIds.length) {
      await database
        .delete(auditEvents)
        .where(inArray(auditEvents.participantId, participantIds));
      await database
        .delete(participants)
        .where(inArray(participants.id, participantIds));
    }
    if (agentId) {
      await database.delete(personalAgents).where(eq(personalAgents.id, agentId));
    }
    if (userId) {
      await database.delete(syllaUsers).where(eq(syllaUsers.id, userId));
    }
    if (eventIds.length) {
      await database.delete(events).where(inArray(events.id, eventIds));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
