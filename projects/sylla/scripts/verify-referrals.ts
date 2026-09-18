import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  eventInvitations,
  events,
  participants,
  personalAgents,
  syllaUsers,
} from "../src/db/schema";
import {
  createEventInvitation,
  previewInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";
import {
  createReferralInvitation,
  listReferrals,
  referralAllowance,
  ReferralError,
  revokeReferralInvitation,
} from "../src/lib/sylla/referrals";

/**
 * Members vouching for members.
 *
 * The rules that matter are the ones that stop the loop being farmed: you
 * cannot invite before you have consented yourself, and a seat comes back only
 * when a real person decides to stay — not merely when a link is opened.
 */
function consent(displayName: string) {
  return {
    displayName,
    policyVersion: PARTICIPATION_POLICY_VERSION,
    ageConfirmed: true,
    publicSourceResearch: true,
    privateMemoryStorage: true,
    matchmaking: false,
    hostDataBoundary: true,
    backgroundContinuation: false,
    availability: [],
  };
}

async function main() {
  const database = getDatabase();
  const slug = `referrals-${randomUUID()}`;
  const everyone: string[] = [];
  const observed: Record<string, unknown> = {};

  try {
    const [event] = await database
      .insert(events)
      .values({ slug, name: "Synthetic referral circle", status: "open" })
      .returning();
    const seed = await createEventInvitation({
      eventId: event.id,
      label: "Seed",
      maxUses: 5,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });

    const { participantId: founder } = await redeemEventInvitation(seed.token);
    everyone.push(founder);

    // Arrived, but has agreed to nothing. Vouching is a claim about a person,
    // so it cannot come before making that claim about yourself.
    const before = await referralAllowance(founder);
    assert.equal(before.granted, 0);
    await assert.rejects(createReferralInvitation(founder), ReferralError);
    observed.cannotInviteBeforeConsenting = true;

    await acceptParticipationConsent(founder, consent("Founder"));
    const opened = await referralAllowance(founder);
    assert.equal(opened.granted, 3, "a consented member starts with three seats");
    assert.equal(opened.remaining, 3);

    // Spend one. It is for one person and carries an expiry.
    const first = await createReferralInvitation(founder, "For a friend");
    assert.equal(first.maxUses, 1, "a vouched seat is not a reusable link");
    assert.ok(first.expiresAt, "a vouched seat expires");
    assert.equal((await referralAllowance(founder)).remaining, 2);

    // Opening the invitation is not the same as staying.
    const { participantId: guest } = await redeemEventInvitation(first.token);
    everyone.push(guest);
    const afterRedeem = await referralAllowance(founder);
    assert.equal(
      afterRedeem.earned,
      0,
      "a redemption alone must not earn a seat, or the loop can be farmed",
    );
    observed.redeemingAloneEarnsNothing = true;

    // Consent is the thing that returns a seat.
    await acceptParticipationConsent(guest, consent("Guest"));
    const afterSettling = await referralAllowance(founder);
    assert.equal(afterSettling.earned, 1, "a seat returns when the guest stays");
    assert.equal(afterSettling.granted, 4);
    assert.equal(afterSettling.remaining, 3);
    observed.seatReturnsWhenTheyStay = true;

    const listed = await listReferrals(founder);
    const record = listed.find((one) => one.invitationId === first.invitationId);
    assert.ok(record?.settledIn);
    assert.equal(record.who, "Guest", "only a name they chose for themselves");
    observed.referralsAreLegible = true;

    // Withdrawing an unused invitation returns the seat; a used one is not
    // revocable, because that person now has their own agent.
    const spare = await createReferralInvitation(founder);
    assert.equal((await referralAllowance(founder)).remaining, 2);
    await revokeReferralInvitation(founder, spare.invitationId);
    assert.equal((await referralAllowance(founder)).remaining, 3);
    await assert.rejects(previewInvitation(spare.token), Error);
    await assert.rejects(
      revokeReferralInvitation(founder, first.invitationId),
      ReferralError,
      "an invitation already used is not withdrawable",
    );
    observed.unusedSeatsComeBackUsedOnesDoNot = true;

    // Someone else's invitation is not yours to withdraw.
    await assert.rejects(
      revokeReferralInvitation(guest, first.invitationId),
      ReferralError,
    );
    observed.cannotTouchAnotherMembersInvitations = true;

    // Seats are finite: spend them all and the next request is refused.
    const remaining = (await referralAllowance(founder)).remaining;
    for (let seat = 0; seat < remaining; seat += 1) {
      await createReferralInvitation(founder);
    }
    assert.equal((await referralAllowance(founder)).remaining, 0);
    await assert.rejects(createReferralInvitation(founder), ReferralError);
    observed.seatsAreFinite = true;

    console.log(JSON.stringify({ verified: true, ...observed }));
  } finally {
    for (const participantId of everyone) {
      const [row] = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);
      await database
        .delete(auditEvents)
        .where(eq(auditEvents.participantId, participantId));
      await database.delete(participants).where(eq(participants.id, participantId));
      if (row?.agentId) {
        await database.delete(personalAgents).where(eq(personalAgents.id, row.agentId));
      }
      if (row?.userId) {
        await database.delete(syllaUsers).where(eq(syllaUsers.id, row.userId));
      }
    }
    const [event] = await database
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1);
    if (event) {
      await database.delete(auditEvents).where(eq(auditEvents.eventId, event.id));
      await database
        .delete(eventInvitations)
        .where(eq(eventInvitations.eventId, event.id));
    }
    await database.delete(events).where(eq(events.slug, slug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
