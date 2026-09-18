import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  candidatePairs,
  disclosureEnvelopes,
  events,
  introductionProposals,
  introductionResponses,
  observations,
  participantBoundaries,
  participants,
  personalAgents,
  shieldDeclines,
  syllaUsers,
} from "../src/db/schema";
import { MockSandboxEvaluationAdapter } from "../src/lib/solari/mock-adapters";
import {
  activeBoundaries,
  releaseBoundary,
  reviewShield,
  setBoundary,
} from "../src/lib/sylla/boundaries";
import {
  approveDisclosureEnvelope,
  createIntroductionProposal,
} from "../src/lib/sylla/introductions";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import { acquireRuntimeLease } from "../src/lib/sylla/leases";
import { evaluatePairDirection, reserveCandidatePair } from "../src/lib/sylla/matching";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";

/**
 * The agent saying no on someone's behalf.
 *
 * The properties worth holding are all about what a boundary must NOT do. It
 * must not be visible from outside, or it becomes a signal about the person
 * refusing. It must not consume the pair, or "not this week" would silently
 * mean "never". And it must not be unreviewable, or it stops being protection
 * and becomes an algorithm choosing who someone meets.
 */
async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `shield-${syntheticId}`;
  const participantIds: string[] = [];
  const observed: Record<string, unknown> = {};
  let eventId: string | undefined;

  const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1_000);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1_000);

  async function seed(name: string, intent: string) {
    const invitation = await createEventInvitation({
      eventId: eventId!,
      label: `Shield ${name}`,
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    const { participantId } = await redeemEventInvitation(invitation.token);
    await acceptParticipationConsent(participantId, {
      displayName: `Synthetic ${name}`,
      policyVersion: PARTICIPATION_POLICY_VERSION,
      ageConfirmed: true,
      publicSourceResearch: true,
      privateMemoryStorage: true,
      matchmaking: true,
      hostDataBoundary: true,
      backgroundContinuation: false,
      availability: [
        { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), timezone: "UTC" },
      ],
    });
    await database
      .update(participants)
      .set({ status: "ready", intent })
      .where(eq(participants.id, participantId));
    const [shareable] = await database
      .insert(observations)
      .values({
        participantId,
        claim: `${name} runs small reading groups.`,
        origin: "told_to_me",
        status: "confirmed",
        visibility: "shareable",
      })
      .returning();
    participantIds.push(participantId);
    return { participantId, shareable };
  }

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: eventSlug,
        name: "Synthetic shield event",
        status: "open",
        venue: "The courtyard bench",
        startsAt,
      })
      .returning();
    eventId = event.id;

    const alice = await seed("alice", "Meet someone building durable communities");
    const bob = await seed("bob", "Meet someone designing humane social tools");
    const adapter = new MockSandboxEvaluationAdapter();

    const pair = await reserveCandidatePair({
      subjectParticipantId: alice.participantId,
      candidateParticipantId: bob.participantId,
    });
    await evaluatePairDirection({
      candidatePairId: pair.id,
      subjectParticipantId: alice.participantId,
      idempotencyKey: `shield-alice-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      adapter,
    });
    const aliceLease = await acquireRuntimeLease({
      participantId: alice.participantId,
      clientId: "chatgpt-alice",
      runId: `alice-${syntheticId}`,
      purpose: "Propose an introduction",
    });
    await approveDisclosureEnvelope({
      participantId: alice.participantId,
      candidatePairId: pair.id,
      authorization: aliceLease,
      observationIds: [alice.shareable.id],
    });

    // Bob puts up a boundary. Alice is never told, and cannot be told.
    await setBoundary(bob.participantId, { kind: "paused" });
    assert.equal((await activeBoundaries(bob.participantId)).length, 1);

    let refusal = "";
    try {
      await createIntroductionProposal({
        participantId: alice.participantId,
        candidatePairId: pair.id,
        authorization: aliceLease,
      });
      assert.fail("a paused member must not receive a proposal");
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    // The exact wording the gate already uses for every unrelated reason. If a
    // boundary produced its own message, the refusal itself would announce that
    // this person has a rule.
    assert.equal(refusal, "This pair is not ready for a proposal.");
    observed.refusalIsIndistinguishable = true;

    const [none] = await database
      .select({ id: introductionProposals.id })
      .from(introductionProposals)
      .where(eq(introductionProposals.candidatePairId, pair.id));
    assert.equal(none, undefined, "a shielded approach creates no proposal");

    // The pair survives. A real decline consumes it forever; "not now" must not.
    await releaseBoundary(bob.participantId, "paused");
    const afterLifting = await createIntroductionProposal({
      participantId: alice.participantId,
      candidatePairId: pair.id,
      authorization: aliceLease,
    });
    assert.ok(afterLifting.id, "the same pair is still proposable afterwards");
    observed.boundaryDoesNotBurnThePair = true;

    // Bob can see what happened, in counts and never in names.
    const review = await reviewShield(bob.participantId);
    assert.equal(review.turnedAwayTotal, 1);
    assert.equal(review.distinctPeople, 1);
    assert.equal(review.byBoundary.paused, 1);
    assert.ok(
      !JSON.stringify(review).toLowerCase().includes("alice"),
      "the shield ledger must never name who was turned away",
    );
    assert.ok(!JSON.stringify(review).includes(alice.participantId));
    observed.reviewableWithoutNamingAnyone = true;

    // mutual_only refuses an approach only one agent arrived at.
    const carol = await seed("carol", "Meet someone running study circles");
    const second = await reserveCandidatePair({
      subjectParticipantId: carol.participantId,
      candidateParticipantId: bob.participantId,
    });
    await evaluatePairDirection({
      candidatePairId: second.id,
      subjectParticipantId: carol.participantId,
      idempotencyKey: `shield-carol-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      adapter,
    });
    const carolLease = await acquireRuntimeLease({
      participantId: carol.participantId,
      clientId: "chatgpt-carol",
      runId: `carol-${syntheticId}`,
      purpose: "Propose an introduction",
    });
    await approveDisclosureEnvelope({
      participantId: carol.participantId,
      candidatePairId: second.id,
      authorization: carolLease,
      observationIds: [carol.shareable.id],
    });

    await setBoundary(bob.participantId, { kind: "mutual_only" });
    await assert.rejects(
      createIntroductionProposal({
        participantId: carol.participantId,
        candidatePairId: second.id,
        authorization: carolLease,
      }),
      /not ready for a proposal/,
      "a cold approach is refused when only mutual is welcome",
    );
    observed.coldApproachesRefused = true;

    // The same pair, once both agents have arrived at it, is welcome.
    await evaluatePairDirection({
      candidatePairId: second.id,
      subjectParticipantId: bob.participantId,
      idempotencyKey: `shield-bob-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      adapter,
    });
    const bobLease = await acquireRuntimeLease({
      participantId: bob.participantId,
      clientId: "chatgpt-bob",
      runId: `bob-${syntheticId}`,
      purpose: "Answer an introduction",
    });
    await approveDisclosureEnvelope({
      participantId: bob.participantId,
      candidatePairId: second.id,
      authorization: bobLease,
      observationIds: [bob.shareable.id],
    });
    const mutual = await createIntroductionProposal({
      participantId: carol.participantId,
      candidatePairId: second.id,
      authorization: carolLease,
    });
    assert.equal(mutual.originTier, "mutual");
    observed.mutualStillGetsThrough = true;

    const settled = await reviewShield(bob.participantId);
    assert.equal(settled.turnedAwayTotal, 2);
    assert.equal(settled.distinctPeople, 2);
    assert.equal(settled.byBoundary.mutual_only, 1);
    assert.ok(settled.mostRecentAt);

    await releaseBoundary(bob.participantId, "mutual_only");
    assert.equal((await activeBoundaries(bob.participantId)).length, 0);
    await assert.rejects(releaseBoundary(bob.participantId, "paused"), Error);
    observed.boundariesLiftCleanly = true;

    console.log(JSON.stringify({ verified: true, ...observed }));
  } finally {
    if (participantIds.length) {
      const pairs = await database
        .select({ id: candidatePairs.id })
        .from(candidatePairs)
        .where(inArray(candidatePairs.participantLowId, participantIds));
      const pairIds = pairs.map((one) => one.id);
      if (pairIds.length) {
        await database
          .delete(introductionResponses)
          .where(
            inArray(
              introductionResponses.introductionProposalId,
              (
                await database
                  .select({ id: introductionProposals.id })
                  .from(introductionProposals)
                  .where(inArray(introductionProposals.candidatePairId, pairIds))
              ).map((one) => one.id),
            ),
          )
          .catch(() => undefined);
        await database
          .delete(introductionProposals)
          .where(inArray(introductionProposals.candidatePairId, pairIds));
        await database
          .delete(disclosureEnvelopes)
          .where(inArray(disclosureEnvelopes.candidatePairId, pairIds));
      }
      await database
        .delete(shieldDeclines)
        .where(inArray(shieldDeclines.participantId, participantIds));
      await database
        .delete(participantBoundaries)
        .where(inArray(participantBoundaries.participantId, participantIds));
      await database
        .delete(observations)
        .where(inArray(observations.participantId, participantIds));
      await database
        .delete(auditEvents)
        .where(inArray(auditEvents.participantId, participantIds));
      const rows = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(inArray(participants.id, participantIds));
      await database
        .delete(participants)
        .where(inArray(participants.id, participantIds));
      const agentIds = rows.map((one) => one.agentId).filter(Boolean) as string[];
      const userIds = rows.map((one) => one.userId).filter(Boolean) as string[];
      if (agentIds.length) {
        await database.delete(personalAgents).where(inArray(personalAgents.id, agentIds));
      }
      if (userIds.length) {
        await database.delete(syllaUsers).where(inArray(syllaUsers.id, userIds));
      }
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
