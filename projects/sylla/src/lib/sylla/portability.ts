import { and, asc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  approvedSources,
  auditEvents,
  introductionOutcomes,
  observations,
  participants,
  personalAgents,
  personalMemories,
  syllaUsers,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import {
  requireHumanHostLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import { retireParticipantWorkspace } from "@/lib/sylla/session";

async function ownedParticipantIds(participantId: string) {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const owned = await database
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.agentId, identity.agentId))
    .orderBy(asc(participants.createdAt));
  return { identity, participantIds: owned.map((row) => row.id) };
}

export async function buildPortableAgentExport(participantId: string) {
  const database = getDatabase();
  const { identity, participantIds } = await ownedParticipantIds(participantId);
  const [agent] = await database
    .select()
    .from(personalAgents)
    .where(eq(personalAgents.id, identity.agentId))
    .limit(1);
  if (!agent) throw new Error("The portable agent no longer exists.");
  const [sourceRows, observationRows, memoryRows, outcomeRows] =
    participantIds.length > 0
      ? await Promise.all([
          database
            .select({
              id: approvedSources.id,
              participantId: approvedSources.participantId,
              url: approvedSources.url,
              label: approvedSources.label,
              title: approvedSources.extractedTitle,
              approvedAt: approvedSources.approvedAt,
            })
            .from(approvedSources)
            .where(inArray(approvedSources.participantId, participantIds))
            .orderBy(asc(approvedSources.approvedAt)),
          database
            .select({
              id: observations.id,
              participantId: observations.participantId,
              sourceId: observations.sourceId,
              claim: observations.claim,
              origin: observations.origin,
              status: observations.status,
              visibility: observations.visibility,
              confidence: observations.confidence,
              observedAt: observations.observedAt,
            })
            .from(observations)
            .where(
              and(
                inArray(observations.participantId, participantIds),
                inArray(observations.status, ["confirmed", "edited"]),
              ),
            )
            .orderBy(asc(observations.observedAt)),
          database
            .select({
              id: personalMemories.id,
              participantId: personalMemories.participantId,
              summary: personalMemories.summary,
              status: personalMemories.status,
              visibility: personalMemories.visibility,
              approvedAt: personalMemories.approvedAt,
            })
            .from(personalMemories)
            .where(
              and(
                inArray(personalMemories.participantId, participantIds),
                inArray(personalMemories.status, ["approved", "edited"]),
              ),
            )
            .orderBy(asc(personalMemories.createdAt)),
          database
            .select({
              id: introductionOutcomes.id,
              participantId: introductionOutcomes.participantId,
              introductionProposalId:
                introductionOutcomes.introductionProposalId,
              met: introductionOutcomes.met,
              worthwhile: introductionOutcomes.worthwhile,
              meetAgain: introductionOutcomes.meetAgain,
              alreadyKnew: introductionOutcomes.alreadyKnew,
              wouldHaveMetWithoutSylla:
                introductionOutcomes.wouldHaveMetWithoutSylla,
              contactExchanged: introductionOutcomes.contactExchanged,
              secondInteractionPlanned:
                introductionOutcomes.secondInteractionPlanned,
              wantsAnotherIntroduction:
                introductionOutcomes.wantsAnotherIntroduction,
              debriefDisposition: introductionOutcomes.debriefDisposition,
              submittedAt: introductionOutcomes.submittedAt,
            })
            .from(introductionOutcomes)
            .where(inArray(introductionOutcomes.participantId, participantIds))
            .orderBy(asc(introductionOutcomes.submittedAt)),
        ])
      : [[], [], [], []];

  return {
    format: "sylla-portable-agent",
    version: 1,
    generatedAt: new Date().toISOString(),
    identity: {
      userId: identity.userId,
      agentId: identity.agentId,
      agentName: agent.name,
      focus: agent.focus,
    },
    participationRefs: participantIds,
    approvedSources: sourceRows.map((source) => ({
      ...source,
      approvedAt: source.approvedAt.toISOString(),
    })),
    approvedObservations: observationRows.map((observation) => ({
      ...observation,
      observedAt: observation.observedAt.toISOString(),
    })),
    approvedPersonalMemories: memoryRows.map((memory) => ({
      ...memory,
      approvedAt: memory.approvedAt?.toISOString() ?? null,
    })),
    introductionOutcomes: outcomeRows.map((outcome) => ({
      ...outcome,
      submittedAt: outcome.submittedAt.toISOString(),
    })),
    privacy: {
      rawDebriefIncluded: false,
      otherParticipantOutcomeIncluded: false,
      providerCredentialIncluded: false,
      desktopCapabilityIncluded: false,
    },
  };
}

export async function deletePortableAgent(input: {
  participantId: string;
  authorization: RuntimeLeaseAuthorization;
  confirmation: "DELETE MY SYLLA AGENT";
}) {
  await requireHumanHostLease(input.participantId, input.authorization);
  if (input.confirmation !== "DELETE MY SYLLA AGENT") {
    throw new Error("Exact deletion confirmation is required.");
  }
  const database = getDatabase();
  const { identity, participantIds } = await ownedParticipantIds(
    input.participantId,
  );

  for (const ownedParticipantId of participantIds) {
    await retireParticipantWorkspace(ownedParticipantId);
  }
  if (participantIds.length > 0) {
    await database
      .delete(auditEvents)
      .where(inArray(auditEvents.participantId, participantIds));
    await database
      .delete(participants)
      .where(inArray(participants.id, participantIds));
  }
  await database
    .delete(personalAgents)
    .where(eq(personalAgents.id, identity.agentId));
  await database.delete(syllaUsers).where(eq(syllaUsers.id, identity.userId));

  return {
    deleted: true as const,
    participantRecordsDeleted: participantIds.length,
    recoverableBySylla: false as const,
  };
}
