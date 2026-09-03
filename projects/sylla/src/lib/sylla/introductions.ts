import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  availabilityWindows,
  candidatePairs,
  directionalEvaluations,
  disclosureEnvelopes,
  events,
  introductionProposals,
  introductionResponses,
  observations,
  participantBlocks,
  participants,
} from "@/db/schema";
import {
  requireHumanHostLease,
  requireRuntimeLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import {
  PARTICIPATION_POLICY_VERSION,
  recordAuditEvent,
  requireParticipationCapability,
} from "@/lib/sylla/participation";

const APPROVED_OBSERVATION_STATUSES = ["confirmed", "edited"] as const;

/** Either tier can be proposed; "recommended" simply means both agents agreed. */
const PROPOSABLE_PAIR_STATUSES: string[] = ["recommended", "proposable"];

/**
 * One-sided proposals remove the filter that used to throttle volume, so the
 * cohort needs explicit limits. Without them one keen participant can work
 * through a whole event and the noise poisons the mutual tier.
 */
const MAX_OPEN_PROPOSALS_INITIATED = 3;
const MAX_OPEN_PROPOSALS_RECEIVED = 5;

export class IntroductionGateError extends Error {}

async function assertProposalCapacity(input: {
  eventId: string;
  initiatorParticipantId: string;
  recipientParticipantId: string;
}) {
  const database = getDatabase();

  const [initiated] = await database
    .select({ total: count() })
    .from(introductionProposals)
    .innerJoin(
      candidatePairs,
      eq(introductionProposals.candidatePairId, candidatePairs.id),
    )
    .where(
      and(
        eq(candidatePairs.eventId, input.eventId),
        eq(introductionProposals.status, "waiting"),
        eq(
          introductionProposals.initiatedByParticipantId,
          input.initiatorParticipantId,
        ),
      ),
    );
  if ((initiated?.total ?? 0) >= MAX_OPEN_PROPOSALS_INITIATED) {
    throw new IntroductionGateError(
      "You already have the maximum number of introductions waiting for an answer. Wait for one to resolve.",
    );
  }

  const [received] = await database
    .select({ total: count() })
    .from(introductionProposals)
    .innerJoin(
      candidatePairs,
      eq(introductionProposals.candidatePairId, candidatePairs.id),
    )
    .where(
      and(
        eq(candidatePairs.eventId, input.eventId),
        eq(introductionProposals.status, "waiting"),
        ne(
          introductionProposals.initiatedByParticipantId,
          input.recipientParticipantId,
        ),
        inArray(candidatePairs.participantLowId, [input.recipientParticipantId]),
      ),
    );
  // The pair table stores an ordered low/high pair, so check both slots.
  const [receivedHigh] = await database
    .select({ total: count() })
    .from(introductionProposals)
    .innerJoin(
      candidatePairs,
      eq(introductionProposals.candidatePairId, candidatePairs.id),
    )
    .where(
      and(
        eq(candidatePairs.eventId, input.eventId),
        eq(introductionProposals.status, "waiting"),
        ne(
          introductionProposals.initiatedByParticipantId,
          input.recipientParticipantId,
        ),
        inArray(candidatePairs.participantHighId, [input.recipientParticipantId]),
      ),
    );
  if (
    (received?.total ?? 0) + (receivedHigh?.total ?? 0) >=
    MAX_OPEN_PROPOSALS_RECEIVED
  ) {
    throw new IntroductionGateError(
      "That participant already has as many introductions waiting as Sylla will send them.",
    );
  }
}

function otherParticipant(
  pair: { participantLowId: string; participantHighId: string },
  participantId: string,
) {
  if (pair.participantLowId === participantId) return pair.participantHighId;
  if (pair.participantHighId === participantId) return pair.participantLowId;
  throw new IntroductionGateError("This candidate pair does not belong to the participant.");
}

export async function approveDisclosureEnvelope(input: {
  participantId: string;
  candidatePairId: string;
  authorization: RuntimeLeaseAuthorization;
  observationIds: string[];
}) {
  await requireHumanHostLease(input.participantId, input.authorization);
  await requireParticipationCapability(input.participantId, "matchmaking");
  const database = getDatabase();
  const [pair] = await database
    .select()
    .from(candidatePairs)
    .where(eq(candidatePairs.id, input.candidatePairId))
    .limit(1);
  if (!pair || !PROPOSABLE_PAIR_STATUSES.includes(pair.status)) {
    throw new IntroductionGateError(
      "At least one agent must recommend this pair before disclosure approval.",
    );
  }
  otherParticipant(pair, input.participantId);
  const observationIds = [...new Set(input.observationIds)];
  if (observationIds.length < 1 || observationIds.length > 5) {
    throw new IntroductionGateError("Approve between one and five observations.");
  }
  const approved = await database
    .select({ id: observations.id })
    .from(observations)
    .where(
      and(
        eq(observations.participantId, input.participantId),
        inArray(observations.id, observationIds),
        inArray(observations.status, [...APPROVED_OBSERVATION_STATUSES]),
        eq(observations.visibility, "shareable"),
      ),
    );
  if (approved.length !== observationIds.length) {
    throw new IntroductionGateError(
      "Every disclosed observation must be approved, shareable, and owned by this participant.",
    );
  }
  const [created] = await database
    .insert(disclosureEnvelopes)
    .values({
      candidatePairId: pair.id,
      participantId: input.participantId,
      observationIds,
      policyVersion: PARTICIPATION_POLICY_VERSION,
    })
    .onConflictDoNothing({
      target: [
        disclosureEnvelopes.candidatePairId,
        disclosureEnvelopes.participantId,
      ],
    })
    .returning();
  if (!created) {
    const [existing] = await database
      .select()
      .from(disclosureEnvelopes)
      .where(
        and(
          eq(disclosureEnvelopes.candidatePairId, pair.id),
          eq(disclosureEnvelopes.participantId, input.participantId),
          isNull(disclosureEnvelopes.revokedAt),
        ),
      )
      .limit(1);
    if (
      !existing ||
      existing.observationIds.length !== observationIds.length ||
      existing.observationIds.some((id) => !observationIds.includes(id))
    ) {
      throw new IntroductionGateError(
        "A different disclosure envelope already exists for this pair.",
      );
    }
    return existing;
  }
  await recordAuditEvent({
    eventId: pair.eventId,
    participantId: input.participantId,
    actorType: "participant",
    action: "disclosure_envelope_approved",
    entityType: "disclosure_envelope",
    entityId: created.id,
    metadata: {
      observationCount: observationIds.length,
      policyVersion: PARTICIPATION_POLICY_VERSION,
    },
  });
  return created;
}

function overlapWindow(
  first: Array<{ id: string; startsAt: Date; endsAt: Date }>,
  second: Array<{ id: string; startsAt: Date; endsAt: Date }>,
) {
  const now = new Date();
  return first
    .flatMap((left) =>
      second.map((right) => {
        const startsAt = new Date(
          Math.max(left.startsAt.getTime(), right.startsAt.getTime(), now.getTime()),
        );
        const overlapEnd = new Date(
          Math.min(left.endsAt.getTime(), right.endsAt.getTime()),
        );
        const endsAt = new Date(
          Math.min(overlapEnd.getTime(), startsAt.getTime() + 30 * 60 * 1_000),
        );
        return {
          startsAt,
          endsAt,
          ids: [left.id, right.id],
          valid: endsAt > startsAt,
        };
      }),
    )
    .filter((window) => window.valid)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
}

export async function createIntroductionProposal(input: {
  participantId: string;
  candidatePairId: string;
  authorization: RuntimeLeaseAuthorization;
}) {
  await requireRuntimeLease(input.participantId, input.authorization);
  await requireParticipationCapability(input.participantId, "matchmaking");
  const database = getDatabase();
  const [pair] = await database
    .select()
    .from(candidatePairs)
    .where(eq(candidatePairs.id, input.candidatePairId))
    .limit(1);
  if (!pair || !PROPOSABLE_PAIR_STATUSES.includes(pair.status)) {
    throw new IntroductionGateError("This pair is not ready for a proposal.");
  }
  const [ownDirection] = await database
    .select({ result: directionalEvaluations.result })
    .from(directionalEvaluations)
    .where(
      and(
        eq(directionalEvaluations.candidatePairId, pair.id),
        eq(directionalEvaluations.subjectParticipantId, input.participantId),
        eq(directionalEvaluations.status, "completed"),
      ),
    )
    .limit(1);
  if (!ownDirection?.result?.recommend) {
    // Your own agent recommending is what licenses you to propose. What the
    // other agent thinks is advice for its own human, not a veto here.
    throw new IntroductionGateError(
      "Your own agent has to recommend this pair before you can propose it.",
    );
  }
  otherParticipant(pair, input.participantId);
  const envelopes = await database
    .select()
    .from(disclosureEnvelopes)
    .where(
      and(
        eq(disclosureEnvelopes.candidatePairId, pair.id),
        isNull(disclosureEnvelopes.revokedAt),
      ),
    );
  if (!envelopes.some((envelope) => envelope.participantId === input.participantId)) {
    throw new IntroductionGateError(
      "Approve what your own introduction may disclose before proposing it.",
    );
  }
  const originTier =
    pair.status === "recommended" && envelopes.length === 2 ? "mutual" : "one_sided";
  await assertProposalCapacity({
    eventId: pair.eventId,
    initiatorParticipantId: input.participantId,
    recipientParticipantId: otherParticipant(pair, input.participantId),
  });
  const [event] = await database
    .select()
    .from(events)
    .where(eq(events.id, pair.eventId))
    .limit(1);
  if (!event?.venue?.trim()) {
    throw new IntroductionGateError(
      "The organizer must set a public meeting area before proposals begin.",
    );
  }
  const windows = await database
    .select({
      id: availabilityWindows.id,
      participantId: availabilityWindows.participantId,
      startsAt: availabilityWindows.startsAt,
      endsAt: availabilityWindows.endsAt,
    })
    .from(availabilityWindows)
    .where(
      inArray(availabilityWindows.participantId, [
        pair.participantLowId,
        pair.participantHighId,
      ]),
    )
    .orderBy(asc(availabilityWindows.startsAt));
  const meeting = overlapWindow(
    windows.filter((window) => window.participantId === pair.participantLowId),
    windows.filter((window) => window.participantId === pair.participantHighId),
  );
  if (!meeting) {
    throw new IntroductionGateError("The pair no longer has future overlapping availability.");
  }
  const expiresAt = new Date(
    Math.min(meeting.startsAt.getTime(), Date.now() + 24 * 60 * 60 * 1_000),
  );
  if (expiresAt <= new Date()) {
    throw new IntroductionGateError("The proposal window has already expired.");
  }
  const [created] = await database
    .insert(introductionProposals)
    .values({
      candidatePairId: pair.id,
      originTier,
      initiatedByParticipantId: input.participantId,
      meetingArea: event.venue.trim(),
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      expiresAt,
    })
    .onConflictDoNothing({ target: introductionProposals.candidatePairId })
    .returning();
  if (created) {
    await recordAuditEvent({
      eventId: pair.eventId,
      actorType: "system",
      action: "introduction_proposal_created",
      entityType: "introduction_proposal",
      entityId: created.id,
      metadata: {
        identityRevealed: false,
        meetingDurationMinutes: 30,
        originTier,
      },
    });
    return created;
  }
  const [existing] = await database
    .select()
    .from(introductionProposals)
    .where(eq(introductionProposals.candidatePairId, pair.id))
    .limit(1);
  if (!existing) throw new Error("Introduction proposal could not be loaded.");
  return existing;
}

async function loadParticipantProposalView(
  participantId: string,
  introductionProposalId: string,
) {
  const database = getDatabase();
  const [joined] = await database
    .select({ proposal: introductionProposals, pair: candidatePairs })
    .from(introductionProposals)
    .innerJoin(
      candidatePairs,
      eq(introductionProposals.candidatePairId, candidatePairs.id),
    )
    .where(eq(introductionProposals.id, introductionProposalId))
    .limit(1);
  if (!joined) throw new IntroductionGateError("Introduction proposal not found.");
  const otherId = otherParticipant(joined.pair, participantId);
  let proposal = joined.proposal;
  if (proposal.status === "waiting" && proposal.expiresAt <= new Date()) {
    const [expired] = await database
      .update(introductionProposals)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(introductionProposals.id, proposal.id),
          eq(introductionProposals.status, "waiting"),
        ),
      )
      .returning();
    proposal = expired ?? proposal;
  }
  const [otherEnvelope, myResponse, other] = await Promise.all([
    database
      .select()
      .from(disclosureEnvelopes)
      .where(
        and(
          eq(disclosureEnvelopes.candidatePairId, joined.pair.id),
          eq(disclosureEnvelopes.participantId, otherId),
          isNull(disclosureEnvelopes.revokedAt),
        ),
      )
      .limit(1),
    database
      .select()
      .from(introductionResponses)
      .where(
        and(
          eq(introductionResponses.introductionProposalId, proposal.id),
          eq(introductionResponses.participantId, participantId),
        ),
      )
      .limit(1),
    database
      .select({ displayName: participants.displayName })
      .from(participants)
      .where(eq(participants.id, otherId))
      .limit(1),
  ]);
  const previewObservations = otherEnvelope[0]
    ? await database
        .select({ id: observations.id, claim: observations.claim })
        .from(observations)
        .where(
          and(
            eq(observations.participantId, otherId),
            inArray(observations.id, otherEnvelope[0].observationIds),
            eq(observations.visibility, "shareable"),
            inArray(observations.status, [...APPROVED_OBSERVATION_STATUSES]),
          ),
        )
    : [];
  if (proposal.originTier === "one_sided" && proposal.status === "waiting") {
    const recommending = await database
      .select({ id: directionalEvaluations.id })
      .from(directionalEvaluations)
      .where(
        and(
          eq(directionalEvaluations.candidatePairId, joined.pair.id),
          eq(directionalEvaluations.status, "completed"),
        ),
      );
    if (recommending.length === 2 && joined.pair.status === "recommended") {
      const [upgraded] = await database
        .update(introductionProposals)
        .set({ originTier: "mutual", updatedAt: new Date() })
        .where(
          and(
            eq(introductionProposals.id, proposal.id),
            eq(introductionProposals.originTier, "one_sided"),
          ),
        )
        .returning();
      proposal = upgraded ?? proposal;
    }
  }
  const matched = proposal.status === "matched" || proposal.status === "completed";
  const initiatedByMe = proposal.initiatedByParticipantId === participantId;
  return {
    id: proposal.id,
    origin: {
      tier: proposal.originTier,
      initiatedByMe,
      // Said plainly, because "both agents reached this independently" is real
      // information and a one-sided proposal should not pretend otherwise.
      explanation:
        proposal.originTier === "mutual"
          ? "Both agents reached this independently."
          : initiatedByMe
            ? "Your agent proposed this; theirs has not weighed in."
            : "Their agent proposed this. Yours has not recommended it independently.",
    },
    status: matched
      ? proposal.status
      : proposal.status === "waiting"
        ? "waiting"
        : "closed",
    myDecision: myResponse[0]?.decision ?? null,
    preview: previewObservations,
    otherParticipant: matched
      ? { displayName: other[0]?.displayName ?? "Your introduction" }
      : null,
    meeting: matched
      ? {
          area: proposal.meetingArea,
          startsAt: proposal.startsAt.toISOString(),
          endsAt: proposal.endsAt.toISOString(),
        }
      : null,
    privacy: {
      otherDecisionRevealed: false,
      identityRevealed: matched,
      rawRationaleRevealed: false,
    },
  };
}

export async function respondToIntroductionProposal(input: {
  participantId: string;
  introductionProposalId: string;
  authorization: RuntimeLeaseAuthorization;
  decision: "accepted" | "declined";
  block?: boolean;
}) {
  await requireHumanHostLease(input.participantId, input.authorization);
  await requireParticipationCapability(input.participantId, "matchmaking");
  const database = getDatabase();
  const [joined] = await database
    .select({ proposal: introductionProposals, pair: candidatePairs })
    .from(introductionProposals)
    .innerJoin(
      candidatePairs,
      eq(introductionProposals.candidatePairId, candidatePairs.id),
    )
    .where(eq(introductionProposals.id, input.introductionProposalId))
    .limit(1);
  if (!joined) throw new IntroductionGateError("Introduction proposal not found.");
  const otherId = otherParticipant(joined.pair, input.participantId);
  if (joined.proposal.status !== "waiting" || joined.proposal.expiresAt <= new Date()) {
    throw new IntroductionGateError("This proposal is no longer waiting for a response.");
  }
  if (input.block && input.decision !== "declined") {
    throw new IntroductionGateError("Blocking also declines the proposal.");
  }
  if (input.decision === "accepted") {
    const [ownEnvelope] = await database
      .select({ id: disclosureEnvelopes.id })
      .from(disclosureEnvelopes)
      .where(
        and(
          eq(disclosureEnvelopes.candidatePairId, joined.pair.id),
          eq(disclosureEnvelopes.participantId, input.participantId),
          isNull(disclosureEnvelopes.revokedAt),
        ),
      )
      .limit(1);
    if (!ownEnvelope) {
      throw new IntroductionGateError(
        "Approve what your own introduction may disclose before accepting.",
      );
    }
  }
  const [created] = await database
    .insert(introductionResponses)
    .values({
      introductionProposalId: joined.proposal.id,
      participantId: input.participantId,
      decision: input.decision,
      blockRequested: input.block ?? false,
    })
    .onConflictDoNothing({
      target: [
        introductionResponses.introductionProposalId,
        introductionResponses.participantId,
      ],
    })
    .returning();
  if (!created) {
    const [existing] = await database
      .select()
      .from(introductionResponses)
      .where(
        and(
          eq(introductionResponses.introductionProposalId, joined.proposal.id),
          eq(introductionResponses.participantId, input.participantId),
        ),
      )
      .limit(1);
    if (
      !existing ||
      existing.decision !== input.decision ||
      existing.blockRequested !== (input.block ?? false)
    ) {
      throw new IntroductionGateError("This participant already answered differently.");
    }
    return loadParticipantProposalView(input.participantId, joined.proposal.id);
  }
  if (input.block) {
    await database
      .insert(participantBlocks)
      .values({
        blockerParticipantId: input.participantId,
        blockedParticipantId: otherId,
      })
      .onConflictDoNothing({
        target: [
          participantBlocks.blockerParticipantId,
          participantBlocks.blockedParticipantId,
        ],
      });
  }
  const responses = await database
    .select()
    .from(introductionResponses)
    .where(eq(introductionResponses.introductionProposalId, joined.proposal.id));
  const status = responses.some((response) => response.decision === "declined")
    ? "declined"
    : responses.length === 2
      ? "matched"
      : "waiting";
  await database
    .update(introductionProposals)
    .set({
      status,
      matchedAt: status === "matched" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(introductionProposals.id, joined.proposal.id));
  await recordAuditEvent({
    eventId: joined.pair.eventId,
    participantId: input.participantId,
    actorType: "participant",
    action: "introduction_proposal_answered",
    entityType: "introduction_proposal",
    entityId: joined.proposal.id,
    metadata: {
      decision: input.decision,
      blockRequested: input.block ?? false,
      identityRevealed: status === "matched",
    },
  });
  return loadParticipantProposalView(input.participantId, joined.proposal.id);
}

export async function getIntroductionProposalForParticipant(
  participantId: string,
  introductionProposalId: string,
) {
  return loadParticipantProposalView(participantId, introductionProposalId);
}
