import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  emailContacts,
  events,
  participants,
  personalAgents,
  syllaUsers,
} from "../src/db/schema";
import { ensurePortableIdentity } from "../src/lib/sylla/identity";
import {
  confirmEmailVerification,
  getContact,
  NotificationError,
  prepareNotification,
  markNotified,
  removeContact,
  startEmailVerification,
  unsubscribeByToken,
  updatePreferences,
} from "../src/lib/sylla/notifications";

/**
 * When Sylla may write to somebody, and what it may say.
 *
 * The properties are all restraints. Sylla holds no address unless given one,
 * sends nothing to an address that has not been proved, says that something
 * happened and never what, writes at most once a day, and can always be
 * stopped by someone who cannot sign in.
 */
async function main() {
  const database = getDatabase();
  const slug = `notify-${randomUUID()}`;
  let participantId: string | undefined;
  const observed: Record<string, unknown> = {};

  try {
    const [event] = await database
      .insert(events)
      .values({ slug, name: "Synthetic notifications", status: "open" })
      .returning();
    const [participant] = await database
      .insert(participants)
      .values({
        eventId: event.id,
        inviteTokenHash: `notify-${randomUUID()}`,
        displayName: "Synthetic participant",
        ageConfirmed: true,
        status: "ready",
      })
      .returning();
    participantId = participant.id;
    const identity = await ensurePortableIdentity(participantId);

    // Nothing on file, and nothing sendable.
    assert.equal((await getContact(participantId)).address, null);
    assert.equal(
      await prepareNotification({ userId: identity.userId, kind: "needs_you", count: 3 }),
      null,
      "no address means no message",
    );
    observed.silentWithoutAnAddress = true;

    await assert.rejects(
      startEmailVerification(participantId, "not-an-address"),
      NotificationError,
    );

    const started = await startEmailVerification(
      participantId,
      "  Synthetic.Person@Example.com ",
    );
    assert.equal(started.address, "synthetic.person@example.com");

    // An unproved address receives nothing. This is what stops Sylla being a
    // way to mail a stranger.
    assert.equal(
      await prepareNotification({
        userId: identity.userId,
        kind: "work_finished",
        count: 2,
      }),
      null,
      "an unverified address must never be written to",
    );
    observed.nothingBeforeTheAddressIsProved = true;

    const token = new URL(started.verifyUrl).searchParams.get("token")!;
    await confirmEmailVerification(token);
    assert.equal((await getContact(participantId)).verified, true);
    await assert.rejects(confirmEmailVerification(token), NotificationError);
    observed.verificationIsSingleUse = true;

    const message = await prepareNotification({
      userId: identity.userId,
      kind: "work_finished",
      count: 2,
    });
    assert.ok(message);
    assert.equal(message.address, "synthetic.person@example.com");

    // The whole point: it says that, never what. A count and a door.
    const body = `${message.subject}\n${message.text}`;
    assert.match(body, /finished 2/);
    assert.match(message.text, /stays in Sylla rather than in your inbox/);
    for (const leak of ["Index", "dossier", "claim", "retention", "@example.com"]) {
      assert.ok(
        !message.text.includes(leak),
        `a notification must not carry ${leak}`,
      );
    }
    assert.ok(message.unsubscribeUrl.includes("token="));
    assert.ok(
      message.unsubscribeUrl.split("token=")[1].length > 20,
      "every message carries a working way out",
    );
    observed.saysThatNeverWhat = true;

    // One a day. A busy agent must not become a mailing list.
    await markNotified(identity.userId);
    assert.equal(
      await prepareNotification({
        userId: identity.userId,
        kind: "needs_you",
        count: 5,
      }),
      null,
      "a second message inside the quiet period must not go out",
    );
    observed.atMostOneADay = true;

    // Switching one kind off silences only that kind.
    await database
      .update(emailContacts)
      .set({ lastSentAt: null })
      .where(eq(emailContacts.userId, identity.userId));
    await updatePreferences(participantId, { notifyNeedsYou: false });
    assert.equal(
      await prepareNotification({
        userId: identity.userId,
        kind: "needs_you",
        count: 5,
      }),
      null,
    );
    assert.ok(
      await prepareNotification({
        userId: identity.userId,
        kind: "work_finished",
        count: 1,
      }),
    );
    observed.preferencesAreHonouredPerKind = true;

    // The link in a message works without signing in, and stops everything.
    const stopToken = message.unsubscribeUrl.split("token=")[1];
    await unsubscribeByToken(stopToken);
    const silenced = await getContact(participantId);
    assert.equal(silenced.notifyWorkFinished, false);
    assert.equal(silenced.notifyNeedsYou, false);
    assert.equal(
      await prepareNotification({
        userId: identity.userId,
        kind: "work_finished",
        count: 9,
      }),
      null,
    );
    await assert.rejects(unsubscribeByToken("not-a-token"), NotificationError);
    observed.unsubscribeNeedsNoPassword = true;

    // Changing the address un-verifies it, so proving one cannot redirect mail.
    await updatePreferences(participantId, { notifyWorkFinished: true });
    await startEmailVerification(participantId, "someone.else@example.com");
    assert.equal((await getContact(participantId)).verified, false);
    assert.equal(
      await prepareNotification({
        userId: identity.userId,
        kind: "work_finished",
        count: 1,
      }),
      null,
      "a changed address must be proved again before anything is sent",
    );
    observed.changingTheAddressRequiresProvingItAgain = true;

    await removeContact(participantId);
    assert.equal((await getContact(participantId)).address, null);
    observed.theAddressCanBeForgotten = true;

    console.log(JSON.stringify({ verified: true, ...observed }));
  } finally {
    if (participantId) {
      const [row] = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);
      if (row?.userId) {
        await database
          .delete(emailContacts)
          .where(eq(emailContacts.userId, row.userId));
      }
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
    await database.delete(events).where(eq(events.slug, slug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
