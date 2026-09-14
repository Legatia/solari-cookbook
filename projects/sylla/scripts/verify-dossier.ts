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
  subjects,
  syllaUsers,
} from "../src/db/schema";
import {
  deleteSubject,
  ensureSubject,
  getDossier,
  listSubjects,
  recordSubjectClaim,
  SubjectError,
} from "../src/lib/sylla/subjects";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";
import { buildPortableAgentExport } from "../src/lib/sylla/portability";
import { loadSessionState } from "../src/lib/sylla/session";

/**
 * The book an agent keeps on other people.
 *
 * Everything worth testing here is a fence. A dossier is the first record in
 * Sylla about someone who is not present and did not consent, so what matters
 * is not that it stores things but that what it stores cannot escape: not into
 * another participant's introduction, not into a matching evaluation, not into
 * the participant's own shareable account of themselves.
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
  const slug = `dossier-${randomUUID()}`;
  const participantIds: string[] = [];
  const observed: Record<string, unknown> = {};

  try {
    const [event] = await database
      .insert(events)
      .values({ slug, name: "Synthetic dossier event", status: "open" })
      .returning();
    const invitation = await createEventInvitation({
      eventId: event.id,
      label: "Dossier",
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    const { participantId } = await redeemEventInvitation(invitation.token);
    participantIds.push(participantId);
    await acceptParticipationConsent(participantId, consent("Synthetic founder"));

    // Opening a dossier is idempotent on the name: the agent does this
    // mid-sentence, and saying it twice must not produce two books.
    const first = await ensureSubject(participantId, {
      kind: "organization",
      name: "Index Ventures",
      relationship: "Series A — met at the cohort dinner",
    });
    assert.equal(first.created, true);
    const again = await ensureSubject(participantId, {
      kind: "organization",
      name: "  index ventures  ",
    });
    assert.equal(again.created, false);
    assert.equal(again.id, first.id, "the same firm typed twice is one dossier");
    observed.oneBookPerName = true;

    await recordSubjectClaim({
      participantId,
      subjectId: first.id,
      claim: "Asked for two more months of retention before a term sheet.",
      origin: "told_to_me",
      contact: true,
    });
    const researched = await recordSubjectClaim({
      participantId,
      subjectId: first.id,
      claim: "Led the Series A in a comparable company last year.",
      origin: "observed",
      evidenceExcerpt: "Announced on the firm's public portfolio page.",
    });

    // What the participant says is theirs to assert; what the agent read still
    // waits for them.
    assert.equal(researched.status, "pending");
    const dossier = await getDossier(participantId, first.id);
    assert.equal(dossier.claims.length, 2);
    assert.equal(dossier.known, 1);
    assert.equal(dossier.pending, 1);
    assert.ok(dossier.lastContactAt, "a note from a conversation records contact");
    observed.provenanceSeparatesToldFromRead = true;

    // The fence: a third party's record can never be made shareable.
    const stored = await database
      .select({ visibility: observations.visibility })
      .from(observations)
      .where(eq(observations.subjectId, first.id));
    assert.ok(
      stored.every((row) => row.visibility === "private"),
      "a dossier claim must never be shareable",
    );
    observed.dossierClaimsAreAlwaysPrivate = true;

    // It must not appear in the participant's own record of themselves.
    const state = await loadSessionState(participantId);
    const surfaced = JSON.stringify(state);
    assert.ok(
      !surfaced.includes("Index Ventures") && !surfaced.includes("retention"),
      "a dossier must not leak into what Sylla knows about the participant",
    );
    observed.absentFromTheirOwnMemory = true;

    // It must leave with them, under its own key rather than mixed in.
    const exported = await buildPortableAgentExport(participantId);
    assert.equal(exported.dossiers.length, 1);
    assert.equal(exported.dossiers[0].name, "Index Ventures");
    assert.ok(
      !exported.approvedObservations?.some?.((one: { claim: string }) =>
        one.claim.includes("retention"),
      ),
      "a third party's record is not filed as the participant's own claim",
    );
    observed.portableUnderItsOwnKey = true;

    // Another participant's dossier is not reachable, even by id.
    const second = await createEventInvitation({
      eventId: event.id,
      label: "Dossier other",
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    const other = await redeemEventInvitation(second.token);
    participantIds.push(other.participantId);
    await acceptParticipationConsent(other.participantId, consent("Synthetic other"));
    await assert.rejects(
      getDossier(other.participantId, first.id),
      SubjectError,
      "one participant must not read another's book",
    );
    await assert.rejects(
      recordSubjectClaim({
        participantId: other.participantId,
        subjectId: first.id,
        claim: "Trying to write into someone else's dossier.",
        origin: "told_to_me",
      }),
      SubjectError,
    );
    assert.equal((await listSubjects(other.participantId)).length, 0);
    observed.neverPooledAcrossAccounts = true;

    // Closing a dossier takes its claims with it. "Forget this person" is the
    // strongest thing Sylla can be asked, and it is not hedged.
    await deleteSubject(participantId, first.id);
    const left = await database
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.subjectId, first.id));
    assert.equal(left.length, 0, "closing a dossier deletes what it held");
    assert.equal((await listSubjects(participantId)).length, 0);
    observed.closingItDeletesEverything = true;

    console.log(JSON.stringify({ verified: true, ...observed }));
  } finally {
    if (participantIds.length) {
      const rows = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(inArray(participants.id, participantIds));
      await database
        .delete(subjects)
        .where(inArray(subjects.participantId, participantIds));
      await database
        .delete(observations)
        .where(inArray(observations.participantId, participantIds));
      await database
        .delete(auditEvents)
        .where(inArray(auditEvents.participantId, participantIds));
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
    const [event] = await database
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1);
    if (event) {
      await database.delete(auditEvents).where(eq(auditEvents.eventId, event.id));
    }
    await database.delete(events).where(eq(events.slug, slug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
