import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  availabilityWindows,
  candidatePairs,
  directionalEvaluations,
  matchingRuns,
  observations,
  participantBlocks,
  participantConsents,
  participants,
} from "@/db/schema";
import type {
  DirectionalEvaluation,
  SandboxEvaluationAdapter,
} from "@/lib/solari/contracts";
import { createSolariAdapters } from "@/lib/solari/factory";
import {
  releaseBillableOperation,
  reserveBillableOperation,
  settleBillableOperation,
} from "@/lib/sylla/billing";
import {
  PARTICIPATION_POLICY_VERSION,
  recordAuditEvent,
  requireParticipationCapability,
} from "@/lib/sylla/participation";

const ACTIVE_PAIR_STATUSES = [
  "shortlisted",
  "evaluating",
  "recommended",
] as const;
const APPROVED_OBSERVATION_STATUSES = ["confirmed", "edited"] as const;

type CandidateContext = {
  participantId: string;
  observationIds: string[];
  shareableClaims: Array<{ id: string; claim: string }>;
  availabilityWindowIds: string[];
  explanation: string;
};

export type CandidateShortlist = {
  subjectParticipantId: string;
  candidates: CandidateContext[];
  policy: {
    sameEvent: true;
    activeConsent: true;
    availabilityOverlap: true;
    blocksExcluded: true;
    priorDeclinesExcluded: true;
    approvedShareableContextOnly: true;
    compatibilityScoreUsed: false;
  };
};

export class MatchingEligibilityError extends Error {}
export class MatchingIdempotencyError extends Error {}

function overlaps(
  first: { startsAt: Date; endsAt: Date },
  second: { startsAt: Date; endsAt: Date },
) {
  return first.startsAt < second.endsAt && second.startsAt < first.endsAt;
}

function canonicalPair(first: string, second: string) {
  if (first === second) {
    throw new MatchingEligibilityError("A participant cannot be paired with themself.");
  }
  return first < second ? [first, second] as const : [second, first] as const;
}

export async function getCandidateShortlist(
  subjectParticipantId: string,
  limit = 5,
): Promise<CandidateShortlist> {
  await requireParticipationCapability(subjectParticipantId, "matchmaking");
  const database = getDatabase();
  const [subject] = await database
    .select()
    .from(participants)
    .where(eq(participants.id, subjectParticipantId))
    .limit(1);
  if (!subject || subject.status !== "ready" || !subject.intent?.trim()) {
    throw new MatchingEligibilityError(
      "The participant must be ready with a current introduction intent.",
    );
  }
  const subjectAvailability = await database
    .select()
    .from(availabilityWindows)
    .where(eq(availabilityWindows.participantId, subjectParticipantId));
  if (!subjectAvailability.length) {
    throw new MatchingEligibilityError("The participant has no active availability.");
  }
  const activeSubjectPair = await database
    .select({ id: candidatePairs.id })
    .from(candidatePairs)
    .where(
      and(
        eq(candidatePairs.eventId, subject.eventId),
        inArray(candidatePairs.status, [...ACTIVE_PAIR_STATUSES]),
        or(
          eq(candidatePairs.participantLowId, subjectParticipantId),
          eq(candidatePairs.participantHighId, subjectParticipantId),
        ),
      ),
    )
    .limit(1);
  if (activeSubjectPair.length) {
    return {
      subjectParticipantId,
      candidates: [],
      policy: shortlistPolicy(),
    };
  }

  const candidateRows = await database
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.eventId, subject.eventId),
        eq(participants.status, "ready"),
        ne(participants.id, subjectParticipantId),
      ),
    )
    .orderBy(asc(participants.createdAt));
  if (!candidateRows.length) {
    return { subjectParticipantId, candidates: [], policy: shortlistPolicy() };
  }
  const candidateIds = candidateRows.map((candidate) => candidate.id);
  const [consents, windows, shareableObservations, blocks, priorPairs, activePairs] =
    await Promise.all([
      database
        .select()
        .from(participantConsents)
        .where(
          and(
            inArray(participantConsents.participantId, candidateIds),
            eq(participantConsents.policyVersion, PARTICIPATION_POLICY_VERSION),
            eq(participantConsents.matchmaking, true),
            isNull(participantConsents.withdrawnAt),
          ),
        ),
      database
        .select()
        .from(availabilityWindows)
        .where(inArray(availabilityWindows.participantId, candidateIds)),
      database
        .select()
        .from(observations)
        .where(
          and(
            inArray(observations.participantId, candidateIds),
            inArray(observations.status, [...APPROVED_OBSERVATION_STATUSES]),
            eq(observations.visibility, "shareable"),
          ),
        ),
      database
        .select()
        .from(participantBlocks)
        .where(
          or(
            and(
              eq(participantBlocks.blockerParticipantId, subjectParticipantId),
              inArray(participantBlocks.blockedParticipantId, candidateIds),
            ),
            and(
              eq(participantBlocks.blockedParticipantId, subjectParticipantId),
              inArray(participantBlocks.blockerParticipantId, candidateIds),
            ),
          ),
        ),
      database
        .select()
        .from(candidatePairs)
        .where(
          and(
            eq(candidatePairs.eventId, subject.eventId),
            eq(candidatePairs.status, "rejected"),
            or(
              eq(candidatePairs.participantLowId, subjectParticipantId),
              eq(candidatePairs.participantHighId, subjectParticipantId),
            ),
          ),
        ),
      database
        .select()
        .from(candidatePairs)
        .where(
          and(
            eq(candidatePairs.eventId, subject.eventId),
            inArray(candidatePairs.status, [...ACTIVE_PAIR_STATUSES]),
          ),
        ),
    ]);
  const consented = new Set(consents.map((consent) => consent.participantId));
  const blocked = new Set(
    blocks.map((block) =>
      block.blockerParticipantId === subjectParticipantId
        ? block.blockedParticipantId
        : block.blockerParticipantId,
    ),
  );
  const declined = new Set(
    priorPairs.map((pair) =>
      pair.participantLowId === subjectParticipantId
        ? pair.participantHighId
        : pair.participantLowId,
    ),
  );
  const conflicted = new Set(
    activePairs.flatMap((pair) => [pair.participantLowId, pair.participantHighId]),
  );
  const candidates = candidateRows.flatMap((candidate) => {
    if (
      !candidate.intent?.trim() ||
      !consented.has(candidate.id) ||
      blocked.has(candidate.id) ||
      declined.has(candidate.id) ||
      conflicted.has(candidate.id)
    ) {
      return [];
    }
    const candidateWindows = windows.filter(
      (window) => window.participantId === candidate.id,
    );
    const overlapWindows = candidateWindows.filter((window) =>
      subjectAvailability.some((subjectWindow) => overlaps(subjectWindow, window)),
    );
    const candidateObservations = shareableObservations.filter(
      (observation) => observation.participantId === candidate.id,
    );
    if (!overlapWindows.length || !candidateObservations.length) return [];
    return [{
      participantId: candidate.id,
      observationIds: candidateObservations.map((observation) => observation.id),
      shareableClaims: candidateObservations.map((observation) => ({
        id: observation.id,
        claim: observation.claim,
      })),
      availabilityWindowIds: overlapWindows.map((window) => window.id),
      explanation:
        "Same opted-in event, overlapping availability, a current intent, and participant-approved shareable context. This is eligibility, not compatibility.",
    }];
  });
  return {
    subjectParticipantId,
    candidates: candidates.slice(0, Math.min(10, Math.max(1, limit))),
    policy: shortlistPolicy(),
  };
}

function shortlistPolicy() {
  return {
    sameEvent: true,
    activeConsent: true,
    availabilityOverlap: true,
    blocksExcluded: true,
    priorDeclinesExcluded: true,
    approvedShareableContextOnly: true,
    compatibilityScoreUsed: false,
  } as const;
}

export async function startMatchingRun(input: {
  eventId: string;
  idempotencyKey: string;
}) {
  const database = getDatabase();
  const [created] = await database
    .insert(matchingRuns)
    .values({
      eventId: input.eventId,
      idempotencyKey: input.idempotencyKey,
      status: "running",
      startedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [matchingRuns.eventId, matchingRuns.idempotencyKey],
    })
    .returning();
  if (created) return created;
  const [existing] = await database
    .select()
    .from(matchingRuns)
    .where(
      and(
        eq(matchingRuns.eventId, input.eventId),
        eq(matchingRuns.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Matching run could not be loaded.");
  return existing;
}

export async function reserveCandidatePair(input: {
  subjectParticipantId: string;
  candidateParticipantId: string;
  matchingRunId?: string;
}) {
  const shortlist = await getCandidateShortlist(input.subjectParticipantId, 10);
  const candidate = shortlist.candidates.find(
    (item) => item.participantId === input.candidateParticipantId,
  );
  if (!candidate) {
    throw new MatchingEligibilityError(
      "The candidate is no longer eligible for this participant.",
    );
  }
  const database = getDatabase();
  const [subject] = await database
    .select({ eventId: participants.eventId })
    .from(participants)
    .where(eq(participants.id, input.subjectParticipantId))
    .limit(1);
  if (!subject) throw new MatchingEligibilityError("Participant not found.");
  const [lowId, highId] = canonicalPair(
    input.subjectParticipantId,
    input.candidateParticipantId,
  );
  const subjectIsLow = lowId === input.subjectParticipantId;
  const [pair] = await database
    .insert(candidatePairs)
    .values({
      eventId: subject.eventId,
      matchingRunId: input.matchingRunId,
      participantLowId: lowId,
      participantHighId: highId,
      retrievalEvidence: {
        lowObservationIds: subjectIsLow ? [] : candidate.observationIds,
        highObservationIds: subjectIsLow ? candidate.observationIds : [],
        availabilityWindowIds: candidate.availabilityWindowIds,
        explanation: candidate.explanation,
      },
    })
    .onConflictDoNothing({
      target: [
        candidatePairs.eventId,
        candidatePairs.participantLowId,
        candidatePairs.participantHighId,
      ],
    })
    .returning();
  if (!pair) {
    throw new MatchingEligibilityError(
      "This pair already exists or another run reserved it.",
    );
  }
  if (input.matchingRunId) {
    await database
      .update(matchingRuns)
      .set({ candidateCount: 1, status: "completed", completedAt: new Date() })
      .where(eq(matchingRuns.id, input.matchingRunId));
  }
  await recordAuditEvent({
    eventId: pair.eventId,
    participantId: input.subjectParticipantId,
    actorType: "system",
    action: "candidate_pair_reserved",
    entityType: "candidate_pair",
    entityId: pair.id,
    metadata: { approvedShareableContextOnly: true },
  });
  return pair;
}

function assertEvaluationReferences(
  result: DirectionalEvaluation,
  subjectIds: string[],
  candidateIds: string[],
) {
  const subject = new Set(subjectIds);
  const candidate = new Set(candidateIds);
  const allowed = new Set([...subjectIds, ...candidateIds]);
  for (const rationale of result.rationale) {
    if (
      rationale.supportingObservationIds.some((id) => !allowed.has(id)) ||
      !rationale.supportingObservationIds.some((id) => subject.has(id)) ||
      !rationale.supportingObservationIds.some((id) => candidate.has(id))
    ) {
      throw new MatchingEligibilityError(
        "Evaluation rationale must cite authorized observations from both directions.",
      );
    }
  }
}

export async function evaluatePairDirection(input: {
  candidatePairId: string;
  subjectParticipantId: string;
  idempotencyKey: string;
  orchestrator: "host_requested_sandbox" | "internal_fallback";
  adapter?: SandboxEvaluationAdapter;
}) {
  await requireParticipationCapability(input.subjectParticipantId, "matchmaking");
  const database = getDatabase();
  const [pair] = await database
    .select()
    .from(candidatePairs)
    .where(eq(candidatePairs.id, input.candidatePairId))
    .limit(1);
  if (!pair || ![pair.participantLowId, pair.participantHighId].includes(input.subjectParticipantId)) {
    throw new MatchingEligibilityError("Candidate pair not found for this participant.");
  }
  if (!["shortlisted", "evaluating"].includes(pair.status)) {
    throw new MatchingEligibilityError("This pair is no longer open for evaluation.");
  }
  const candidateParticipantId =
    pair.participantLowId === input.subjectParticipantId
      ? pair.participantHighId
      : pair.participantLowId;
  await requireParticipationCapability(candidateParticipantId, "matchmaking");
  const [existing] = await database
    .select()
    .from(directionalEvaluations)
    .where(
      and(
        eq(directionalEvaluations.candidatePairId, pair.id),
        eq(directionalEvaluations.subjectParticipantId, input.subjectParticipantId),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.idempotencyKey !== input.idempotencyKey) {
      throw new MatchingIdempotencyError(
        "This direction already belongs to a different evaluation request.",
      );
    }
    return existing;
  }
  const [subjectObservations, candidateObservations] = await Promise.all([
    database
      .select({ id: observations.id, claim: observations.claim })
      .from(observations)
      .where(
        and(
          eq(observations.participantId, input.subjectParticipantId),
          inArray(observations.status, [...APPROVED_OBSERVATION_STATUSES]),
        ),
      ),
    database
      .select({ id: observations.id, claim: observations.claim })
      .from(observations)
      .where(
        and(
          eq(observations.participantId, candidateParticipantId),
          inArray(observations.status, [...APPROVED_OBSERVATION_STATUSES]),
          eq(observations.visibility, "shareable"),
        ),
      ),
  ]);
  if (!subjectObservations.length || !candidateObservations.length) {
    throw new MatchingEligibilityError(
      "Both directions need approved evidence; candidate evidence must be shareable.",
    );
  }
  const reservation = await reserveBillableOperation({
    participantId: input.subjectParticipantId,
    operation: "sandbox_evaluation",
    idempotencyKey: input.idempotencyKey,
  });
  if (reservation.alreadyProcessed) {
    throw new MatchingIdempotencyError(
      "The billed Sandbox evaluation already completed but its result is unavailable.",
    );
  }
  let evaluationId: string | null = null;
  try {
    const [evaluation] = await database
      .insert(directionalEvaluations)
      .values({
        candidatePairId: pair.id,
        subjectParticipantId: input.subjectParticipantId,
        candidateParticipantId,
        idempotencyKey: input.idempotencyKey,
        orchestrator: input.orchestrator,
        policyVersion: PARTICIPATION_POLICY_VERSION,
        subjectObservationIds: subjectObservations.map((item) => item.id),
        candidateObservationIds: candidateObservations.map((item) => item.id),
      })
      .returning();
    evaluationId = evaluation.id;
    await database
      .update(candidatePairs)
      .set({ status: "evaluating", updatedAt: new Date() })
      .where(eq(candidatePairs.id, pair.id));
    const adapter = input.adapter ?? (await createSolariAdapters()).sandbox;
    const result = await adapter.evaluate({
      direction: `${input.subjectParticipantId}-to-${candidateParticipantId}`,
      participantObservations: subjectObservations,
      candidateObservations,
    });
    assertEvaluationReferences(
      result,
      subjectObservations.map((item) => item.id),
      candidateObservations.map((item) => item.id),
    );
    const [completed] = await database
      .update(directionalEvaluations)
      .set({
        status: "completed",
        provider: result.evaluator,
        result,
        completedAt: new Date(),
      })
      .where(eq(directionalEvaluations.id, evaluationId))
      .returning();
    const directions = await database
      .select()
      .from(directionalEvaluations)
      .where(
        and(
          eq(directionalEvaluations.candidatePairId, pair.id),
          eq(directionalEvaluations.status, "completed"),
        ),
      );
    const pairStatus = directions.some((direction) => !direction.result?.recommend)
      ? "rejected"
      : directions.length === 2
        ? "recommended"
        : "evaluating";
    await database
      .update(candidatePairs)
      .set({ status: pairStatus, updatedAt: new Date() })
      .where(eq(candidatePairs.id, pair.id));
    await recordAuditEvent({
      eventId: pair.eventId,
      participantId: input.subjectParticipantId,
      actorType: "system",
      action: "directional_evaluation_completed",
      entityType: "directional_evaluation",
      entityId: evaluationId,
      metadata: {
        recommend: result.recommend,
        uncertainty: result.uncertainty,
        evaluator: result.evaluator,
        policyVersion: PARTICIPATION_POLICY_VERSION,
      },
    });
    await settleBillableOperation(reservation, result.evaluator);
    return completed;
  } catch (error) {
    if (evaluationId) {
      await database
        .update(directionalEvaluations)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
          completedAt: new Date(),
        })
        .where(eq(directionalEvaluations.id, evaluationId));
    }
    await releaseBillableOperation(reservation);
    throw error;
  }
}

export async function getCandidatePairForParticipant(
  participantId: string,
  candidatePairId: string,
) {
  const database = getDatabase();
  const [pair] = await database
    .select()
    .from(candidatePairs)
    .where(
      and(
        eq(candidatePairs.id, candidatePairId),
        or(
          eq(candidatePairs.participantLowId, participantId),
          eq(candidatePairs.participantHighId, participantId),
        ),
      ),
    )
    .limit(1);
  if (!pair) throw new MatchingEligibilityError("Candidate pair not found.");
  const evaluations = await database
    .select({
      subjectParticipantId: directionalEvaluations.subjectParticipantId,
      status: directionalEvaluations.status,
      recommend: directionalEvaluations.result,
      orchestrator: directionalEvaluations.orchestrator,
      provider: directionalEvaluations.provider,
    })
    .from(directionalEvaluations)
    .where(eq(directionalEvaluations.candidatePairId, candidatePairId));
  return {
    id: pair.id,
    status:
      pair.status === "recommended"
        ? "recommended"
        : pair.status === "rejected" || pair.status === "canceled" || pair.status === "expired"
          ? "closed"
          : "evaluating",
    readyForProposal: pair.status === "recommended",
    evaluations: evaluations.map((item) => ({
      directionOwnedByCaller: item.subjectParticipantId === participantId,
      status:
        item.subjectParticipantId === participantId
          ? item.status
          : item.status === "completed"
            ? "received"
            : "pending",
      recommend:
        item.subjectParticipantId === participantId
          ? item.recommend?.recommend ?? null
          : null,
      orchestrator: item.orchestrator,
      provider: item.provider,
    })),
  };
}
