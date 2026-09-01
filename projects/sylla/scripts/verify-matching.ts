import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  events,
  observations,
  participantBlocks,
  participants,
  personalAgents,
  syllaUsers,
  usageLedger,
} from "../src/db/schema";
import { MockSandboxEvaluationAdapter } from "../src/lib/solari/mock-adapters";
import {
  evaluatePairDirection,
  getCandidatePairForParticipant,
  getCandidateShortlist,
  reserveCandidatePair,
  startMatchingRun,
} from "../src/lib/sylla/matching";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `matching-${syntheticId}`;
  const participantIds: string[] = [];
  const userIds: string[] = [];
  const agentIds: string[] = [];
  let eventId: string | undefined;
  const liveSandbox = process.env.SYLLA_VERIFY_LIVE_SANDBOX === "true";

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: eventSlug,
        name: "Synthetic matching event",
        status: "open",
      })
      .returning();
    eventId = event.id;
    const cohort = [
      { name: "Alice", intent: "Meet someone who builds community technology" },
      { name: "Bob", intent: "Meet someone interested in durable local community" },
      { name: "Cara", intent: "Meet thoughtful product builders" },
      { name: "Dan", intent: "Meet people working on creative tools" },
    ];
    for (let index = 0; index < cohort.length; index += 1) {
      const person = cohort[index]!;
      const [participant] = await database
        .insert(participants)
        .values({
          eventId,
          inviteTokenHash: `matching-${syntheticId}-${index}`,
          displayName: person.name,
          intent: person.intent,
          ageConfirmed: false,
          status: "invited",
        })
        .returning();
      participantIds.push(participant.id);
      const overlapping = index !== 3;
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
            startsAt: overlapping
              ? "2026-09-10T18:00:00.000Z"
              : "2026-09-11T18:00:00.000Z",
            endsAt: overlapping
              ? "2026-09-10T20:00:00.000Z"
              : "2026-09-11T20:00:00.000Z",
            timezone: "Europe/Warsaw",
          },
        ],
      });
      await database
        .update(participants)
        .set({ status: "ready", intent: person.intent })
        .where(eq(participants.id, participant.id));
    }
    const [aliceId, bobId, caraId] = participantIds as [string, string, string, string];
    const insertedObservations = await database
      .insert(observations)
      .values([
        {
          participantId: aliceId,
          claim: "Builds tools for lasting human relationships.",
          origin: "told_to_me",
          status: "confirmed",
          visibility: "shareable",
          confidence: "high",
        },
        {
          participantId: aliceId,
          claim: "Privately feels exhausted by performative networking.",
          origin: "told_to_me",
          status: "confirmed",
          visibility: "private",
          confidence: "high",
        },
        {
          participantId: bobId,
          claim: "Organizes recurring neighborhood dinners.",
          origin: "observed",
          status: "confirmed",
          visibility: "shareable",
          confidence: "high",
        },
        {
          participantId: bobId,
          claim: "Privately worries about moving to a new city.",
          origin: "told_to_me",
          status: "confirmed",
          visibility: "private",
          confidence: "high",
        },
        {
          participantId: caraId,
          claim: "Designs tools for small creative groups.",
          origin: "observed",
          status: "confirmed",
          visibility: "shareable",
          confidence: "high",
        },
        {
          participantId: participantIds[3]!,
          claim: "Makes collaborative music software.",
          origin: "observed",
          status: "confirmed",
          visibility: "shareable",
          confidence: "high",
        },
      ])
      .returning();
    const alicePrivate = insertedObservations.find(
      (row) => row.participantId === aliceId && row.visibility === "private",
    )!;
    const bobShareable = insertedObservations.find(
      (row) => row.participantId === bobId && row.visibility === "shareable",
    )!;
    const bobPrivate = insertedObservations.find(
      (row) => row.participantId === bobId && row.visibility === "private",
    )!;
    await database.insert(participantBlocks).values({
      blockerParticipantId: aliceId,
      blockedParticipantId: caraId,
    });

    const shortlist = await getCandidateShortlist(aliceId, 5);
    assert.deepEqual(shortlist.candidates.map((item) => item.participantId), [bobId]);
    assert.equal(shortlist.policy.compatibilityScoreUsed, false);
    assert.equal(
      shortlist.candidates[0]?.observationIds.includes(bobPrivate.id),
      false,
    );
    const run = await startMatchingRun({
      eventId,
      idempotencyKey: `matching-run-${syntheticId}`,
    });
    const pair = await reserveCandidatePair({
      subjectParticipantId: aliceId,
      candidateParticipantId: bobId,
      matchingRunId: run.id,
    });
    const afterReservation = await getCandidateShortlist(aliceId, 5);
    assert.equal(afterReservation.candidates.length, 0);

    const adapter = liveSandbox ? undefined : new MockSandboxEvaluationAdapter();
    const aliceEvaluation = await evaluatePairDirection({
      candidatePairId: pair.id,
      subjectParticipantId: aliceId,
      idempotencyKey: `alice-eval-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      ...(adapter ? { adapter } : {}),
    });
    assert.equal(aliceEvaluation.result?.recommend, true);
    assert.ok(aliceEvaluation.subjectObservationIds.includes(alicePrivate.id));
    assert.ok(aliceEvaluation.candidateObservationIds.includes(bobShareable.id));
    assert.equal(aliceEvaluation.candidateObservationIds.includes(bobPrivate.id), false);
    const repeated = await evaluatePairDirection({
      candidatePairId: pair.id,
      subjectParticipantId: aliceId,
      idempotencyKey: `alice-eval-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      ...(adapter ? { adapter } : {}),
    });
    assert.equal(repeated.id, aliceEvaluation.id);

    const bobEvaluation = await evaluatePairDirection({
      candidatePairId: pair.id,
      subjectParticipantId: bobId,
      idempotencyKey: `bob-eval-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      ...(adapter ? { adapter } : {}),
    });
    assert.equal(bobEvaluation.result?.recommend, true);
    const gate = await getCandidatePairForParticipant(aliceId, pair.id);
    assert.equal(gate.status, "recommended");
    assert.equal(gate.readyForProposal, true);
    assert.equal(
      gate.evaluations.find((item) => !item.directionOwnedByCaller)?.recommend,
      null,
    );

    const identityRows = await database
      .select({ userId: participants.userId, agentId: participants.agentId })
      .from(participants)
      .where(inArray(participants.id, [aliceId, bobId]));
    for (const identity of identityRows) {
      if (identity.userId) userIds.push(identity.userId);
      if (identity.agentId) agentIds.push(identity.agentId);
    }
    const usage = await database
      .select()
      .from(usageLedger)
      .where(inArray(usageLedger.userId, userIds));
    assert.equal(
      usage.filter(
        (entry) =>
          entry.operation === "sandbox_evaluation" && entry.status === "settled",
      ).length,
      2,
    );

    console.log(
      JSON.stringify({
        verified: true,
        eligibleCandidateCount: shortlist.candidates.length,
        blockedCandidateExcluded: true,
        unavailableCandidateExcluded: true,
        candidatePrivateObservationExcluded: true,
        subjectPrivateObservationAllowedInOwnDirection: true,
        sandboxDirectionsCompleted: 2,
        sandboxMode: liveSandbox ? "live" : "mock",
        duplicateEvaluationCount: 0,
        bilateralRecommendationGate: gate.readyForProposal,
        identityRevealed: false,
        introductionCreated: false,
      }),
    );
  } finally {
    if (eventId) {
      await database.delete(auditEvents).where(eq(auditEvents.eventId, eventId));
      await database.delete(events).where(eq(events.id, eventId));
    }
    if (agentIds.length) {
      await database.delete(personalAgents).where(inArray(personalAgents.id, agentIds));
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
