import { and, asc, eq, inArray } from "drizzle-orm";
import * as z from "zod/v4";

import { getDatabase } from "@/db";
import {
  candidatePairs,
  introductionOutcomes,
  introductionProposals,
  introductionResponses,
  personalMemories,
  participants,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import {
  requireHumanHostLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import {
  recordAuditEvent,
  requireParticipationCapability,
} from "@/lib/sylla/participation";
import { retireParticipantWorkspace } from "@/lib/sylla/session";

const answerSchema = z.enum(["yes", "no", "unsure"]);

export const structuredOutcomeSchema = z
  .object({
    met: z.boolean(),
    worthwhile: answerSchema.nullable(),
    meetAgain: answerSchema.nullable(),
    alreadyKnew: z.boolean(),
    wouldHaveMetWithoutSylla: answerSchema,
    contactExchanged: z.boolean(),
    secondInteractionPlanned: z.boolean(),
    wantsAnotherIntroduction: z.boolean(),
    debriefDisposition: z.enum([
      "skipped",
      "quick",
      "private_host_conversation",
    ]),
    proposedMemories: z.array(z.string().trim().min(3).max(280)).max(3),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.met && (value.worthwhile !== null || value.meetAgain !== null)) {
      context.addIssue({
        code: "custom",
        message: "Worthwhile and meet-again answers require a meeting.",
      });
    }
    if (
      !value.met &&
      (value.contactExchanged || value.secondInteractionPlanned)
    ) {
      context.addIssue({
        code: "custom",
        message: "Second-action signals require a meeting.",
      });
    }
    if (value.met && (value.worthwhile === null || value.meetAgain === null)) {
      context.addIssue({
        code: "custom",
        message: "A completed meeting needs worthwhile and meet-again answers.",
      });
    }
    if (
      value.debriefDisposition === "skipped" &&
      value.proposedMemories.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "A skipped debrief cannot create proposed memories.",
      });
    }
  });

export type StructuredOutcomeInput = z.infer<typeof structuredOutcomeSchema>;

export class OutcomeGateError extends Error {}

function participantBelongsToPair(
  pair: { participantLowId: string; participantHighId: string },
  participantId: string,
) {
  return (
    pair.participantLowId === participantId ||
    pair.participantHighId === participantId
  );
}

function outcomeView(outcome: typeof introductionOutcomes.$inferSelect) {
  return {
    id: outcome.id,
    introductionProposalId: outcome.introductionProposalId,
    met: outcome.met,
    worthwhile: outcome.worthwhile,
    meetAgain: outcome.meetAgain,
    alreadyKnew: outcome.alreadyKnew,
    wouldHaveMetWithoutSylla: outcome.wouldHaveMetWithoutSylla,
    contactExchanged: outcome.contactExchanged,
    secondInteractionPlanned: outcome.secondInteractionPlanned,
    wantsAnotherIntroduction: outcome.wantsAnotherIntroduction,
    debriefDisposition: outcome.debriefDisposition,
    proposedMemoryCount: outcome.proposedMemoryCount,
    submittedAt: outcome.submittedAt.toISOString(),
  };
}

export async function submitIntroductionOutcome(input: {
  participantId: string;
  introductionProposalId: string;
  authorization: RuntimeLeaseAuthorization;
  outcome: unknown;
}) {
  await requireHumanHostLease(input.participantId, input.authorization);
  await requireParticipationCapability(input.participantId, "privateMemoryStorage");
  const outcome = structuredOutcomeSchema.parse(input.outcome);
  const proposedMemories = [...new Set(outcome.proposedMemories)];
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
  if (
    !joined ||
    !participantBelongsToPair(joined.pair, input.participantId) ||
    !["matched", "completed"].includes(joined.proposal.status)
  ) {
    throw new OutcomeGateError(
      "Only a participant in a mutually accepted introduction can submit an outcome.",
    );
  }
  const [acceptance] = await database
    .select({ decision: introductionResponses.decision })
    .from(introductionResponses)
    .where(
      and(
        eq(
          introductionResponses.introductionProposalId,
          input.introductionProposalId,
        ),
        eq(introductionResponses.participantId, input.participantId),
        eq(introductionResponses.decision, "accepted"),
      ),
    )
    .limit(1);
  if (!acceptance) {
    throw new OutcomeGateError("The participant did not accept this introduction.");
  }

  const [created] = await database
    .insert(introductionOutcomes)
    .values({
      introductionProposalId: input.introductionProposalId,
      participantId: input.participantId,
      met: outcome.met,
      worthwhile: outcome.worthwhile,
      meetAgain: outcome.meetAgain,
      alreadyKnew: outcome.alreadyKnew,
      wouldHaveMetWithoutSylla: outcome.wouldHaveMetWithoutSylla,
      contactExchanged: outcome.contactExchanged,
      secondInteractionPlanned: outcome.secondInteractionPlanned,
      wantsAnotherIntroduction: outcome.wantsAnotherIntroduction,
      debriefDisposition: outcome.debriefDisposition,
      proposedMemoryCount: proposedMemories.length,
    })
    .onConflictDoNothing({
      target: [
        introductionOutcomes.introductionProposalId,
        introductionOutcomes.participantId,
      ],
    })
    .returning();
  if (!created) {
    const [existing] = await database
      .select()
      .from(introductionOutcomes)
      .where(
        and(
          eq(
            introductionOutcomes.introductionProposalId,
            input.introductionProposalId,
          ),
          eq(introductionOutcomes.participantId, input.participantId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("The outcome could not be loaded.");
    return {
      outcome: outcomeView(existing),
      memoryProposals: await listParticipantMemories(input.participantId, {
        outcomeId: existing.id,
      }),
      otherOutcomeRevealed: false as const,
    };
  }

  if (proposedMemories.length > 0) {
    await database.insert(personalMemories).values(
      proposedMemories.map((summary) => ({
        participantId: input.participantId,
        introductionOutcomeId: created.id,
        summary,
        status: "proposed" as const,
        visibility: "private" as const,
      })),
    );
  }
  const collected = await database
    .select({ id: introductionOutcomes.id })
    .from(introductionOutcomes)
    .where(
      eq(
        introductionOutcomes.introductionProposalId,
        input.introductionProposalId,
      ),
    );
  if (collected.length === 2) {
    await database
      .update(introductionProposals)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(introductionProposals.id, input.introductionProposalId));
  }
  await recordAuditEvent({
    eventId: joined.pair.eventId,
    participantId: input.participantId,
    actorType: "participant",
    action: "introduction_outcome_submitted",
    entityType: "introduction_outcome",
    entityId: created.id,
    metadata: {
      met: outcome.met,
      debriefDisposition: outcome.debriefDisposition,
      proposedMemoryCount: proposedMemories.length,
      rawDebriefPersisted: false,
    },
  });
  return {
    outcome: outcomeView(created),
    memoryProposals: await listParticipantMemories(input.participantId, {
      outcomeId: created.id,
    }),
    otherOutcomeRevealed: false as const,
  };
}

export async function getOwnIntroductionOutcome(
  participantId: string,
  introductionProposalId: string,
) {
  const [outcome] = await getDatabase()
    .select()
    .from(introductionOutcomes)
    .where(
      and(
        eq(introductionOutcomes.participantId, participantId),
        eq(
          introductionOutcomes.introductionProposalId,
          introductionProposalId,
        ),
      ),
    )
    .limit(1);
  return outcome
    ? { ...outcomeView(outcome), otherOutcomeRevealed: false as const }
    : null;
}

export async function listParticipantMemories(
  participantId: string,
  options: { outcomeId?: string; includeForgotten?: boolean } = {},
) {
  const identity = await ensurePortableIdentity(participantId);
  const ownedParticipants = await getDatabase()
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.agentId, identity.agentId));
  const participantIds = ownedParticipants.map((participant) => participant.id);
  if (participantIds.length === 0) return [];
  const conditions = [inArray(personalMemories.participantId, participantIds)];
  if (options.outcomeId) {
    conditions.push(eq(personalMemories.introductionOutcomeId, options.outcomeId));
  }
  if (!options.includeForgotten) {
    conditions.push(
      inArray(personalMemories.status, ["proposed", "approved", "edited"]),
    );
  }
  const memories = await getDatabase()
    .select()
    .from(personalMemories)
    .where(and(...conditions))
    .orderBy(asc(personalMemories.createdAt));
  return memories.map((memory) => ({
    id: memory.id,
    summary: memory.summary,
    status: memory.status,
    visibility: memory.visibility,
    approvedAt: memory.approvedAt?.toISOString() ?? null,
    source: memory.introductionOutcomeId ? "introduction_debrief" : "personal",
  }));
}

export async function reviewPersonalMemory(input: {
  participantId: string;
  memoryId: string;
  authorization: RuntimeLeaseAuthorization;
  decision: "approve" | "edit" | "forget";
  editedSummary?: string;
}) {
  await requireHumanHostLease(input.participantId, input.authorization);
  await requireParticipationCapability(input.participantId, "privateMemoryStorage");
  const database = getDatabase();
  const identity = await ensurePortableIdentity(input.participantId);
  const ownedParticipants = await database
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.agentId, identity.agentId));
  const participantIds = ownedParticipants.map((participant) => participant.id);
  const [memory] = await database
    .select()
    .from(personalMemories)
    .where(
      and(
        eq(personalMemories.id, input.memoryId),
        inArray(personalMemories.participantId, participantIds),
      ),
    )
    .limit(1);
  if (!memory) throw new OutcomeGateError("That memory proposal was not found.");
  if (memory.status === "forgotten") {
    throw new OutcomeGateError("A forgotten memory cannot be restored.");
  }
  const editedSummary = input.editedSummary?.trim();
  if (input.decision === "edit" && (!editedSummary || editedSummary.length > 280)) {
    throw new OutcomeGateError("An edited memory must contain 3 to 280 characters.");
  }
  if (input.decision !== "edit" && editedSummary) {
    throw new OutcomeGateError("Only an edit may include a replacement summary.");
  }
  await retireParticipantWorkspace(input.participantId);
  const now = new Date();
  const [updated] = await database
    .update(personalMemories)
    .set(
      input.decision === "forget"
        ? { status: "forgotten", forgottenAt: now }
        : {
            status: input.decision === "edit" ? "edited" : "approved",
            ...(editedSummary ? { summary: editedSummary } : {}),
            approvedAt: now,
            forgottenAt: null,
          },
    )
    .where(eq(personalMemories.id, memory.id))
    .returning();
  await recordAuditEvent({
    participantId: input.participantId,
    actorType: "participant",
    action: `personal_memory_${input.decision === "forget" ? "forgotten" : "approved"}`,
    entityType: "personal_memory",
    entityId: memory.id,
    metadata: {
      edited: input.decision === "edit",
      rawDebriefPersisted: false,
    },
  });
  return {
    id: updated.id,
    summary: updated.summary,
    status: updated.status,
    visibility: updated.visibility,
    approvedAt: updated.approvedAt?.toISOString() ?? null,
  };
}
