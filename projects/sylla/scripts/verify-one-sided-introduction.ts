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
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import {
  acquireRuntimeLease,
  releaseRuntimeLease,
} from "../src/lib/sylla/leases";
import { evaluatePairDirection, reserveCandidatePair } from "../src/lib/sylla/matching";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `one-sided-${syntheticId}`;
  const participantIds: string[] = [];
  let eventId: string | undefined;

  const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1_000);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1_000);

  async function seed(name: string, intent: string) {
    const invitation = await createEventInvitation({
      eventId: eventId!,
      label: `One sided ${name}`,
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
        name: "Synthetic one-sided event",
        status: "open",
        venue: "The courtyard bench",
        startsAt,
      })
      .returning();
    eventId = event.id;

    const alice = await seed("alice", "Meet someone building durable communities");
    const bob = await seed("bob", "Meet someone designing humane social tools");

    const pair = await reserveCandidatePair({
      subjectParticipantId: alice.participantId,
      candidateParticipantId: bob.participantId,
    });
    const adapter = new MockSandboxEvaluationAdapter();

    // 1. Only Alice's agent evaluates. Bob's agent never weighs in.
    await evaluatePairDirection({
      candidatePairId: pair.id,
      subjectParticipantId: alice.participantId,
      idempotencyKey: `one-sided-alice-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      adapter,
    });
    const [afterOne] = await database
      .select({ status: candidatePairs.status })
      .from(candidatePairs)
      .where(eq(candidatePairs.id, pair.id))
      .limit(1);
    assert.equal(
      afterOne.status,
      "proposable",
      "one recommendation is enough to propose",
    );

    const aliceLease = await acquireRuntimeLease({
      participantId: alice.participantId,
      clientId: "chatgpt-alice",
      runId: `alice-${syntheticId}`,
      purpose: "Propose a one-sided introduction",
    });

    // 2. Bob cannot propose: his own agent has not recommended anything.
    const bobLease = await acquireRuntimeLease({
      participantId: bob.participantId,
      clientId: "chatgpt-bob",
      runId: `bob-${syntheticId}`,
      purpose: "Answer a one-sided introduction",
    });
    await assert.rejects(
      createIntroductionProposal({
        participantId: bob.participantId,
        candidatePairId: pair.id,
        authorization: bobLease,
      }),
      /your own agent/i,
      "proposing requires your own agent's recommendation",
    );

    // 3. Alice must approve her own envelope, and only hers, to propose.
    await assert.rejects(
      createIntroductionProposal({
        participantId: alice.participantId,
        candidatePairId: pair.id,
        authorization: aliceLease,
      }),
      /disclose/i,
      "an envelope is required before proposing",
    );
    await approveDisclosureEnvelope({
      participantId: alice.participantId,
      candidatePairId: pair.id,
      authorization: aliceLease,
      observationIds: [alice.shareable.id],
    });
    const proposal = await createIntroductionProposal({
      participantId: alice.participantId,
      candidatePairId: pair.id,
      authorization: aliceLease,
    });
    assert.equal(
      proposal.originTier,
      "one_sided",
      "a single recommendation produces a one-sided proposal",
    );
    assert.equal(proposal.initiatedByParticipantId, alice.participantId);

    // 4. Bob is told honestly how it arose, and sees no identity.
    const bobView = await getIntroductionProposalForParticipant(
      bob.participantId,
      proposal.id,
    );
    assert.equal(bobView.origin.tier, "one_sided");
    assert.equal(bobView.origin.initiatedByMe, false);
    assert.match(bobView.origin.explanation, /Their agent proposed this/);
    assert.equal(bobView.otherParticipant, null, "no identity before acceptance");
    assert.equal(bobView.meeting, null, "no meeting before acceptance");
    assert.equal(bobView.preview.length, 1, "Bob sees only Alice's approved envelope");

    // 5. Bob cannot accept until he says what may be disclosed about him.
    await assert.rejects(
      respondToIntroductionProposal({
        participantId: bob.participantId,
        introductionProposalId: proposal.id,
        authorization: bobLease,
        decision: "accepted",
      }),
      /disclose/i,
      "accepting reveals identity, so it needs Bob's own envelope",
    );

    // 6. Bob's own agent may still evaluate, to advise him. That upgrades the
    //    tier honestly rather than gating anything.
    await evaluatePairDirection({
      candidatePairId: pair.id,
      subjectParticipantId: bob.participantId,
      idempotencyKey: `one-sided-bob-${syntheticId}`,
      orchestrator: "host_requested_sandbox",
      adapter,
    });
    const upgraded = await getIntroductionProposalForParticipant(
      bob.participantId,
      proposal.id,
    );
    assert.equal(upgraded.origin.tier, "mutual", "a late agreement upgrades the tier");
    assert.match(upgraded.origin.explanation, /independently/);

    // 7. With both envelopes and both acceptances, identity appears.
    await approveDisclosureEnvelope({
      participantId: bob.participantId,
      candidatePairId: pair.id,
      authorization: bobLease,
      observationIds: [bob.shareable.id],
    });
    await respondToIntroductionProposal({
      participantId: bob.participantId,
      introductionProposalId: proposal.id,
      authorization: bobLease,
      decision: "accepted",
    });
    const beforeAlice = await getIntroductionProposalForParticipant(
      alice.participantId,
      proposal.id,
    );
    assert.equal(
      beforeAlice.otherParticipant,
      null,
      "one acceptance still reveals nothing",
    );
    await respondToIntroductionProposal({
      participantId: alice.participantId,
      introductionProposalId: proposal.id,
      authorization: aliceLease,
      decision: "accepted",
    });
    const matched = await getIntroductionProposalForParticipant(
      alice.participantId,
      proposal.id,
    );
    assert.ok(matched.otherParticipant, "mutual acceptance reveals identity");
    assert.ok(matched.meeting, "mutual acceptance reveals the meeting");

    await releaseRuntimeLease(alice.participantId, aliceLease);
    await releaseRuntimeLease(bob.participantId, bobLease);

    console.log(
      "One-sided introduction verified: single recommendation is proposable, proposing needs your own agent and your own envelope, the recipient is told the tier honestly, accepting needs their envelope, a late agreement upgrades to mutual, and identity still waits for two acceptances.",
    );
  } finally {
    if (participantIds.length) {
      const pairs = await database
        .select({ id: candidatePairs.id })
        .from(candidatePairs)
        .where(inArray(candidatePairs.participantLowId, participantIds));
      const pairIds = pairs.map((row) => row.id);
      if (pairIds.length) {
        const proposals = await database
          .select({ id: introductionProposals.id })
          .from(introductionProposals)
          .where(inArray(introductionProposals.candidatePairId, pairIds));
        const proposalIds = proposals.map((row) => row.id);
        if (proposalIds.length) {
          await database
            .delete(introductionResponses)
            .where(inArray(introductionResponses.introductionProposalId, proposalIds));
          await database
            .delete(introductionProposals)
            .where(inArray(introductionProposals.id, proposalIds));
        }
        await database
          .delete(disclosureEnvelopes)
          .where(inArray(disclosureEnvelopes.candidatePairId, pairIds));
      }
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
      const agentIds = rows.map((row) => row.agentId).filter(Boolean) as string[];
      const userIds = rows.map((row) => row.userId).filter(Boolean) as string[];
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
