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
  InvitationUnavailableError,
  previewInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";

/**
 * The inner circle, from one invitation to a full room.
 *
 * The behaviour under test is mostly about what must NOT happen: a messenger
 * rendering a link preview must not cost a seat, and the same invitation shown
 * two different ways must not quietly double the circle.
 */
async function main() {
  const database = getDatabase();
  const slug = `circle-${randomUUID()}`;
  const joined: string[] = [];
  const observed: Record<string, unknown> = {};

  try {
    const [event] = await database
      .insert(events)
      .values({ slug, name: "Synthetic inner circle", status: "open" })
      .returning();

    const invitation = await createEventInvitation({
      eventId: event.id,
      label: "Inner circle",
      maxUses: 3,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    assert.ok(invitation.code, "an invitation must carry a spoken code");
    assert.match(invitation.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.ok(!invitation.url.includes(invitation.code), "link and code differ");

    // Every messenger that renders a preview fetches the link first. None of
    // those may cost a seat.
    for (let scan = 0; scan < 4; scan += 1) {
      const preview = await previewInvitation(invitation.token);
      assert.equal(preview.seatsRemaining, 3, "a preview must not spend a seat");
      assert.equal(preview.eventName, "Synthetic inner circle");
    }
    observed.linkPreviewsCostNothing = true;

    // The code previews the same invitation as the link.
    const byCode = await previewInvitation(invitation.code);
    assert.equal(byCode.seatsRemaining, 3);
    assert.equal(byCode.eventName, "Synthetic inner circle");
    observed.codeAndLinkAreTheSameInvitation = true;

    const first = await redeemEventInvitation(invitation.token);
    joined.push(first.participantId);
    assert.equal((await previewInvitation(invitation.token)).seatsRemaining, 2);

    // Someone who was read the code out loud, with the spelling a human uses.
    const spoken = invitation.code.toLowerCase().replace(/-/g, " ");
    const second = await redeemEventInvitation(spoken);
    joined.push(second.participantId);
    assert.equal(
      (await previewInvitation(invitation.code)).seatsRemaining,
      1,
      "the code draws on the same seats as the link",
    );
    observed.spokenCodeAdmitsAndSharesTheSamePool = true;

    const third = await redeemEventInvitation(invitation.token);
    joined.push(third.participantId);

    // Full means full, whichever form is presented.
    await assert.rejects(
      redeemEventInvitation(invitation.token),
      InvitationUnavailableError,
      "a full invitation must stop admitting people",
    );
    await assert.rejects(
      redeemEventInvitation(invitation.code),
      InvitationUnavailableError,
      "the code must not outlive the seats",
    );
    await assert.rejects(previewInvitation(invitation.token), InvitationUnavailableError);
    observed.fullMeansFullBothWays = true;

    assert.equal(new Set(joined).size, 3, "each seat produced a distinct agent");
    const [row] = await database
      .select({ useCount: eventInvitations.useCount })
      .from(eventInvitations)
      .where(eq(eventInvitations.id, invitation.invitationId));
    assert.equal(row.useCount, 3, "exactly the seats offered were spent");
    observed.seatsSpentEqualPeopleAdmitted = true;

    console.log(JSON.stringify({ verified: true, ...observed }));
  } finally {
    for (const participantId of joined) {
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
