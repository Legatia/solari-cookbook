import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  eventInvitations,
  events,
  participants,
  personalAgents,
  subjects,
  syllaUsers,
} from "../src/db/schema";
import { DemoResetError, participantIsDemo, resetDemoAgent } from "../src/lib/sylla/demo-reset";
import { ensurePortableIdentity } from "../src/lib/sylla/identity";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import { DEMO_EVENT_SLUG } from "../src/lib/sylla/session";
import { ensureSubject, recordSubjectClaim } from "../src/lib/sylla/subjects";

/**
 * Starting the demo over, and never anything else.
 *
 * The only property that really matters is the fence. A one-press erase is
 * exactly what a demo needs between runs and exactly what a member must never
 * be able to reach by accident, so the test that counts is the one where a real
 * participant asks for it and is refused.
 */
async function main() {
  const database = getDatabase();
  const slug = `reset-${randomUUID()}`;
  const created: string[] = [];
  const observed: Record<string, unknown> = {};

  try {
    // A real member, in a real circle.
    const [event] = await database
      .insert(events)
      .values({ slug, name: "Synthetic circle", status: "open" })
      .returning();
    const invitation = await createEventInvitation({
      eventId: event.id,
      label: "Reset check",
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    const { participantId: member } = await redeemEventInvitation(invitation.token);
    created.push(member);
    await ensurePortableIdentity(member);

    assert.equal(await participantIsDemo(member), false);
    await assert.rejects(
      resetDemoAgent(member),
      DemoResetError,
      "a member must never be able to erase themselves with one press",
    );
    const stillThere = await database
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.id, member));
    assert.equal(stillThere.length, 1, "the refusal must not delete anything");
    observed.aMemberCannotReset = true;

    // A demo agent, in the demo event, carrying the mess a demo leaves behind.
    const [demoEvent] = await database
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, DEMO_EVENT_SLUG))
      .limit(1);
    assert.ok(demoEvent, "the demo event should already exist in this database");
    const [demo] = await database
      .insert(participants)
      .values({
        eventId: demoEvent.id,
        inviteTokenHash: `reset-${randomUUID()}`,
        displayName: "Synthetic demo",
        ageConfirmed: false,
        status: "invited",
      })
      .returning();
    created.push(demo.id);
    const identity = await ensurePortableIdentity(demo.id);
    const subject = await ensureSubject(demo.id, {
      kind: "organization",
      name: `Left over from the last demo ${randomUUID()}`,
    });
    await recordSubjectClaim({
      participantId: demo.id,
      subjectId: subject.id,
      claim: "Something the previous audience watched being typed.",
      origin: "told_to_me",
    });

    assert.equal(await participantIsDemo(demo.id), true);
    const reset = await resetDemoAgent(demo.id);
    assert.equal(reset.reset, true);
    assert.equal(reset.recoverableBySylla, false);
    observed.aDemoAgentCanBeErased = true;

    // Gone means gone: the agent, its user, and everything it had learned.
    for (const [what, rows] of [
      ["participant", await database.select({ id: participants.id }).from(participants).where(eq(participants.id, demo.id))],
      ["agent", await database.select({ id: personalAgents.id }).from(personalAgents).where(eq(personalAgents.id, identity.agentId))],
      ["user", await database.select({ id: syllaUsers.id }).from(syllaUsers).where(eq(syllaUsers.id, identity.userId))],
      ["dossier", await database.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subject.id))],
    ] as const) {
      assert.equal(rows.length, 0, `${what} should be gone after a reset`);
    }
    observed.nothingSurvivesTheReset = true;
    created.pop();

    console.log(JSON.stringify({ verified: true, ...observed }));
  } finally {
    if (created.length) {
      const rows = await database
        .select({ id: participants.id, userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(inArray(participants.id, created));
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        await database.delete(subjects).where(inArray(subjects.participantId, ids));
        await database.delete(auditEvents).where(inArray(auditEvents.participantId, ids));
        await database.delete(participants).where(inArray(participants.id, ids));
        const agents = rows.map((r) => r.agentId).filter(Boolean) as string[];
        const users = rows.map((r) => r.userId).filter(Boolean) as string[];
        if (agents.length) await database.delete(personalAgents).where(inArray(personalAgents.id, agents));
        if (users.length) await database.delete(syllaUsers).where(inArray(syllaUsers.id, users));
      }
    }
    const [event] = await database
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1);
    if (event) {
      await database.delete(auditEvents).where(eq(auditEvents.eventId, event.id));
      await database.delete(eventInvitations).where(eq(eventInvitations.eventId, event.id));
    }
    await database.delete(events).where(eq(events.slug, slug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
