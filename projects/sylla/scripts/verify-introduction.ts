import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  events,
  observations,
  participants,
  personalAgents,
  syllaUsers,
} from "../src/db/schema";
import { MockSandboxEvaluationAdapter } from "../src/lib/solari/mock-adapters";
import {
  approveDisclosureEnvelope,
  createIntroductionProposal,
  getIntroductionProposalForParticipant,
  respondToIntroductionProposal,
} from "../src/lib/sylla/introductions";
import {
  acquireRuntimeLease,
  releaseRuntimeLease,
  RuntimeLeaseAuthorizationError,
} from "../src/lib/sylla/leases";
import {
  evaluatePairDirection,
  reserveCandidatePair,
} from "../src/lib/sylla/matching";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";
import {
  getOwnIntroductionOutcome,
  listParticipantMemories,
  reviewPersonalMemory,
  submitIntroductionOutcome,
} from "../src/lib/sylla/outcomes";
import { getPrivacySafeEventAggregate } from "../src/lib/sylla/organizer";

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const participantIds: string[] = [];
  const userIds: string[] = [];
  const agentIds: string[] = [];
  let eventId: string | undefined;

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: `introduction-${syntheticId}`,
        name: "Synthetic bilateral introduction",
        venue: "North lobby welcome desk",
        status: "open",
      })
      .returning();
    eventId = event.id;

    for (const [index, person] of [
      { name: "Alice", intent: "Meet someone building durable communities" },
      { name: "Bob", intent: "Meet someone designing humane social tools" },
    ].entries()) {
      const [participant] = await database
        .insert(participants)
        .values({
          eventId,
          inviteTokenHash: `introduction-${syntheticId}-${index}`,
          displayName: person.name,
          intent: person.intent,
          status: "invited",
        })
        .returning();
      participantIds.push(participant.id);
      await acceptParticipationConsent(participant.id, {
        displayName: person.name,
        policyVersion: PARTICIPATION_POLICY_VERSION,
        ageConfirmed: true,
        publicSourceResearch: true,
        privateMemoryStorage: true,
        matchmaking: true,
        hostDataBoundary: true,
        backgroundContinuation: false,
        availability: [
          {
            startsAt: "2026-09-10T18:00:00.000Z",
            endsAt: "2026-09-10T20:00:00.000Z",
            timezone: "Europe/Warsaw",
          },
        ],
      });
      await database
        .update(participants)
        .set({ status: "ready", intent: person.intent })
        .where(eq(participants.id, participant.id));
    }

    const [aliceId, bobId] = participantIds as [string, string];
    const inserted = await database
      .insert(observations)
      .values([
        {
          participantId: aliceId,
          claim: "Builds tools for lasting local relationships.",
          origin: "told_to_me",
          status: "confirmed",
          visibility: "shareable",
          confidence: "high",
        },
        {
          participantId: aliceId,
          claim: "Privately dislikes crowded professional mixers.",
          origin: "told_to_me",
          status: "confirmed",
          visibility: "private",
          confidence: "high",
        },
        {
          participantId: bobId,
          claim: "Hosts a recurring neighborhood dinner.",
          origin: "observed",
          status: "confirmed",
          visibility: "shareable",
          confidence: "high",
        },
        {
          participantId: bobId,
          claim: "Privately worries about moving away.",
          origin: "told_to_me",
          status: "confirmed",
          visibility: "private",
          confidence: "high",
        },
      ])
      .returning();
    const aliceShareable = inserted.find(
      (row) => row.participantId === aliceId && row.visibility === "shareable",
    )!;
    const bobShareable = inserted.find(
      (row) => row.participantId === bobId && row.visibility === "shareable",
    )!;
    const alicePrivate = inserted.find(
      (row) => row.participantId === aliceId && row.visibility === "private",
    )!;
    const bobPrivate = inserted.find(
      (row) => row.participantId === bobId && row.visibility === "private",
    )!;

    const pair = await reserveCandidatePair({
      subjectParticipantId: aliceId,
      candidateParticipantId: bobId,
    });
    const adapter = new MockSandboxEvaluationAdapter();
    await evaluatePairDirection({
      candidatePairId: pair.id,
      subjectParticipantId: aliceId,
      idempotencyKey: `introduction-alice-eval-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      adapter,
    });
    await evaluatePairDirection({
      candidatePairId: pair.id,
      subjectParticipantId: bobId,
      idempotencyKey: `introduction-bob-eval-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      adapter,
    });

    const internalLease = await acquireRuntimeLease({
      participantId: aliceId,
      clientId: "sylla-internal",
      runId: `internal-${syntheticId}`,
      purpose: "Prove fallback cannot make human decisions",
      ownerKind: "internal",
    });
    await assert.rejects(
      approveDisclosureEnvelope({
        participantId: aliceId,
        candidatePairId: pair.id,
        authorization: internalLease,
        observationIds: [aliceShareable.id],
      }),
      RuntimeLeaseAuthorizationError,
    );
    await releaseRuntimeLease(aliceId, internalLease);

    let aliceLease = await acquireRuntimeLease({
      participantId: aliceId,
      clientId: "chatgpt-alice",
      runId: `alice-${syntheticId}`,
      purpose: "Approve and answer introduction",
    });
    await assert.rejects(
      approveDisclosureEnvelope({
        participantId: aliceId,
        candidatePairId: pair.id,
        authorization: aliceLease,
        observationIds: [alicePrivate.id],
      }),
      /shareable/,
    );
    await approveDisclosureEnvelope({
      participantId: aliceId,
      candidatePairId: pair.id,
      authorization: aliceLease,
      observationIds: [aliceShareable.id],
    });

    const bobLease = await acquireRuntimeLease({
      participantId: bobId,
      clientId: "claude-bob",
      runId: `bob-${syntheticId}`,
      purpose: "Approve and answer introduction",
    });
    await approveDisclosureEnvelope({
      participantId: bobId,
      candidatePairId: pair.id,
      authorization: bobLease,
      observationIds: [bobShareable.id],
    });
    const proposal = await createIntroductionProposal({
      participantId: aliceId,
      candidatePairId: pair.id,
      authorization: aliceLease,
    });

    const before = await getIntroductionProposalForParticipant(
      aliceId,
      proposal.id,
    );
    assert.equal(before.status, "waiting");
    assert.equal(before.otherParticipant, null);
    assert.equal(before.meeting, null);
    assert.deepEqual(before.preview.map((item) => item.id), [bobShareable.id]);
    assert.equal(before.preview.some((item) => item.id === bobPrivate.id), false);

    const afterAlice = await respondToIntroductionProposal({
      participantId: aliceId,
      introductionProposalId: proposal.id,
      authorization: aliceLease,
      decision: "accepted",
    });
    assert.equal(afterAlice.status, "waiting");
    assert.equal(afterAlice.otherParticipant, null);
    assert.equal(afterAlice.meeting, null);

    const afterBob = await respondToIntroductionProposal({
      participantId: bobId,
      introductionProposalId: proposal.id,
      authorization: bobLease,
      decision: "accepted",
    });
    assert.equal(afterBob.status, "matched");
    assert.equal(afterBob.otherParticipant?.displayName, "Alice");
    assert.equal(afterBob.meeting?.area, "North lobby welcome desk");
    const afterMutual = await getIntroductionProposalForParticipant(
      aliceId,
      proposal.id,
    );
    assert.equal(afterMutual.otherParticipant?.displayName, "Bob");
    assert.equal(afterMutual.meeting?.area, "North lobby welcome desk");
    assert.equal(afterMutual.privacy.otherDecisionRevealed, false);

    const aliceOutcome = {
      met: true,
      worthwhile: "yes" as const,
      meetAgain: "yes" as const,
      alreadyKnew: false,
      wouldHaveMetWithoutSylla: "no" as const,
      contactExchanged: true,
      secondInteractionPlanned: false,
      wantsAnotherIntroduction: true,
      debriefDisposition: "private_host_conversation" as const,
      proposedMemories: [
        "I value conversations that connect product ideas to local community.",
        "I prefer one focused introduction over a crowded networking room.",
      ],
    };
    await assert.rejects(
      submitIntroductionOutcome({
        participantId: aliceId,
        introductionProposalId: proposal.id,
        authorization: aliceLease,
        outcome: {
          ...aliceOutcome,
          rawDebrief: "This exact private sentence must never be stored.",
        },
      }),
      /Unrecognized key/,
    );
    await releaseRuntimeLease(aliceId, aliceLease);
    const outcomeFallbackLease = await acquireRuntimeLease({
      participantId: aliceId,
      clientId: "sylla-internal",
      runId: `outcome-internal-${syntheticId}`,
      purpose: "Prove fallback cannot submit a debrief",
      ownerKind: "internal",
    });
    await assert.rejects(
      submitIntroductionOutcome({
        participantId: aliceId,
        introductionProposalId: proposal.id,
        authorization: outcomeFallbackLease,
        outcome: aliceOutcome,
      }),
      RuntimeLeaseAuthorizationError,
    );
    await releaseRuntimeLease(aliceId, outcomeFallbackLease);
    aliceLease = await acquireRuntimeLease({
      participantId: aliceId,
      clientId: "chatgpt-alice",
      runId: `alice-outcome-${syntheticId}`,
      purpose: "Submit and review my outcome",
    });
    const aliceSubmission = await submitIntroductionOutcome({
      participantId: aliceId,
      introductionProposalId: proposal.id,
      authorization: aliceLease,
      outcome: aliceOutcome,
    });
    assert.equal(aliceSubmission.memoryProposals.length, 2);
    assert.equal(
      aliceSubmission.memoryProposals.every(
        (memory) => memory.status === "proposed" && memory.visibility === "private",
      ),
      true,
    );
    const [firstMemory, secondMemory] = aliceSubmission.memoryProposals;
    await reviewPersonalMemory({
      participantId: aliceId,
      memoryId: firstMemory!.id,
      authorization: aliceLease,
      decision: "edit",
      editedSummary:
        "I value focused conversations connecting product ideas to community.",
    });
    await reviewPersonalMemory({
      participantId: aliceId,
      memoryId: secondMemory!.id,
      authorization: aliceLease,
      decision: "forget",
    });
    const aliceMemories = await listParticipantMemories(aliceId);
    assert.equal(aliceMemories.length, 1);
    assert.equal(aliceMemories[0]?.status, "edited");

    await submitIntroductionOutcome({
      participantId: bobId,
      introductionProposalId: proposal.id,
      authorization: bobLease,
      outcome: {
        met: true,
        worthwhile: "yes",
        meetAgain: "unsure",
        alreadyKnew: false,
        wouldHaveMetWithoutSylla: "no",
        contactExchanged: false,
        secondInteractionPlanned: false,
        wantsAnotherIntroduction: false,
        debriefDisposition: "skipped",
        proposedMemories: [],
      },
    });
    const bobOwnOutcome = await getOwnIntroductionOutcome(bobId, proposal.id);
    assert.equal(bobOwnOutcome?.worthwhile, "yes");
    assert.equal(bobOwnOutcome?.otherOutcomeRevealed, false);
    const completed = await getIntroductionProposalForParticipant(
      aliceId,
      proposal.id,
    );
    assert.equal(completed.status, "completed");
    const organizerAggregate = await getPrivacySafeEventAggregate(eventId);
    assert.equal(organizerAggregate.suppressed, true);
    assert.equal(organizerAggregate.metrics, null);

    const identityRows = await database
      .select({ userId: participants.userId, agentId: participants.agentId })
      .from(participants)
      .where(inArray(participants.id, participantIds));
    for (const identity of identityRows) {
      if (identity.userId) userIds.push(identity.userId);
      if (identity.agentId) agentIds.push(identity.agentId);
    }
    const audit = await database
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.eventId, eventId));
    assert.equal(
      audit.filter((entry) => entry.action === "disclosure_envelope_approved")
        .length,
      2,
    );

    console.log(
      JSON.stringify({
        verified: true,
        internalFallbackHumanDecisionBlocked: true,
        privateObservationDisclosureBlocked: true,
        bilateralDisclosureRequired: true,
        identityBeforeMutualAcceptance: false,
        meetingBeforeMutualAcceptance: false,
        identityAfterMutualAcceptance: true,
        otherDecisionRevealed: false,
        approvedPreviewObservationCount: before.preview.length,
        rawDebriefFieldRejected: true,
        internalFallbackOutcomeBlocked: true,
        proposedMemoriesRequireReview: true,
        approvedMemoryCount: aliceMemories.length,
        forgottenMemoryExcluded: true,
        otherOutcomeRevealed: false,
        completedOutcomeCount: 2,
        smallCohortOrganizerMetricsSuppressed: true,
      }),
    );
  } finally {
    if (eventId) {
      await database.delete(auditEvents).where(eq(auditEvents.eventId, eventId));
      await database.delete(events).where(eq(events.id, eventId));
    }
    if (agentIds.length) {
      await database
        .delete(personalAgents)
        .where(inArray(personalAgents.id, agentIds));
    }
    if (userIds.length) {
      await database.delete(syllaUsers).where(inArray(syllaUsers.id, userIds));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
