import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  candidatePairs,
  introductionOutcomes,
  introductionProposals,
  participants,
  personalMemories,
} from "@/db/schema";

const MINIMUM_REPORTABLE_COHORT = 8;
const MINIMUM_REPORTABLE_METRIC = 3;

function coarsen(value: number): number | "<3" {
  return value < MINIMUM_REPORTABLE_METRIC ? "<3" : value;
}

export async function getPrivacySafeEventAggregate(eventId: string) {
  const database = getDatabase();
  const participantRows = await database
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.eventId, eventId));
  if (participantRows.length < MINIMUM_REPORTABLE_COHORT) {
    return {
      eventId,
      suppressed: true as const,
      reason: "cohort_too_small" as const,
      minimumCohortSize: MINIMUM_REPORTABLE_COHORT,
      participantCount: participantRows.length,
      metrics: null,
    };
  }

  const participantIds = participantRows.map((participant) => participant.id);
  const proposals = await database
    .select({
      id: introductionProposals.id,
      status: introductionProposals.status,
    })
    .from(introductionProposals)
    .innerJoin(
      candidatePairs,
      eq(introductionProposals.candidatePairId, candidatePairs.id),
    )
    .where(eq(candidatePairs.eventId, eventId));
  const proposalIds = proposals.map((proposal) => proposal.id);
  const outcomes =
    proposalIds.length > 0
      ? await database
          .select()
          .from(introductionOutcomes)
          .where(inArray(introductionOutcomes.introductionProposalId, proposalIds))
      : [];
  const outcomeIds = outcomes.map((outcome) => outcome.id);
  const memories =
    outcomeIds.length > 0
      ? await database
          .select({
            outcomeId: personalMemories.introductionOutcomeId,
            status: personalMemories.status,
          })
          .from(personalMemories)
          .where(inArray(personalMemories.introductionOutcomeId, outcomeIds))
      : [];

  const outcomesByProposal = new Map<
    string,
    typeof introductionOutcomes.$inferSelect[]
  >();
  for (const outcome of outcomes) {
    const existing = outcomesByProposal.get(outcome.introductionProposalId) ?? [];
    existing.push(outcome);
    outcomesByProposal.set(outcome.introductionProposalId, existing);
  }
  let completedMeetings = 0;
  let mutuallyWorthwhile = 0;
  let secondActions = 0;
  for (const pairOutcomes of outcomesByProposal.values()) {
    if (pairOutcomes.length !== 2) continue;
    if (pairOutcomes.every((outcome) => outcome.met)) completedMeetings += 1;
    if (pairOutcomes.every((outcome) => outcome.worthwhile === "yes")) {
      mutuallyWorthwhile += 1;
    }
    if (
      pairOutcomes.some(
        (outcome) =>
          outcome.contactExchanged || outcome.secondInteractionPlanned,
      )
    ) {
      secondActions += 1;
    }
  }

  return {
    eventId,
    suppressed: false as const,
    participantCount: participantIds.length,
    metrics: {
      mutuallyAcceptedIntroductions: coarsen(
        proposals.filter((proposal) =>
          ["matched", "completed"].includes(proposal.status),
        ).length,
      ),
      completedMeetings: coarsen(completedMeetings),
      mutuallyWorthwhile: coarsen(mutuallyWorthwhile),
      secondActions: coarsen(secondActions),
      debriefParticipants: coarsen(
        outcomes.filter(
          (outcome) => outcome.debriefDisposition !== "skipped",
        ).length,
      ),
      approvedMemoryProposals: coarsen(
        memories.filter((memory) =>
          ["approved", "edited"].includes(memory.status),
        ).length,
      ),
      repeatIntroductionRequests: coarsen(
        outcomes.filter((outcome) => outcome.wantsAnotherIntroduction).length,
      ),
    },
    privacy: {
      minimumCohortSize: MINIMUM_REPORTABLE_COHORT,
      smallMetricValuesCoarsened: true,
      participantIdentifiersIncluded: false,
      privateContextIncluded: false,
      rawDebriefIncluded: false,
    },
  };
}
