import { and, asc, eq, inArray, isNull } from "drizzle-orm";

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
import { getConversationProfile } from "@/lib/sylla/conversation";
import { getDossier, listSubjects } from "@/lib/sylla/subjects";
import { retireAgentBrowserProfile } from "@/lib/sylla/computer-use";
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
  const conversationProfile = await getConversationProfile(participantId);
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
                // Exported separately below, so a third party's record is never
                // silently mixed into the participant's own account of themselves.
                isNull(observations.subjectId),
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

  // Dossiers are the participant's own property and leave with them, but under
  // their own key: a record kept on a third party is a different kind of thing
  // from the participant's account of themselves, and flattening the two would
  // make an export that reads as if they had claimed it all about themselves.
  const dossiers =
    participantIds.length > 0
      ? await Promise.all(
          (await listSubjects(participantId)).map((subject) =>
            getDossier(participantId, subject.id),
          ),
        )
      : [];

  return {
    format: "sylla-portable-agent",
    version: 3,
    generatedAt: new Date().toISOString(),
    identity: {
      userId: identity.userId,
      agentId: identity.agentId,
      agentName: agent.name,
      focus: agent.focus,
    },
    participationRefs: participantIds,
    conversationProfile,
    dossiers,
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
  return eraseAgent(input.participantId);
}

/**
 * The erasure itself, with no opinion about who is allowed to ask for it.
 *
 * Kept separate so every caller that may delete an agent deletes the same
 * things. A second implementation would drift, and the way it would drift is by
 * forgetting to release a Solari machine or a browser profile — leaving the
 * expensive half of an account behind after the visible half is gone.
 */
export async function eraseAgent(participantId: string) {
  const database = getDatabase();
  const { identity, participantIds } = await ownedParticipantIds(participantId);

  await retireAgentBrowserProfile({ participantId });
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
