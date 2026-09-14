import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import { observations, subjects } from "@/db/schema";
import { recordAuditEvent } from "@/lib/sylla/participation";

/**
 * The book the agent keeps on everyone else.
 *
 * Every other memory in Sylla is about the participant themselves, which is
 * what makes disclosure safe: the only thing anyone can ever share is their own
 * account of themselves. A dossier breaks that symmetry — it is a record about
 * someone who is not here and did not consent — so it is fenced rather than
 * merely stored.
 *
 * The fence has three rails. A subject belongs to exactly one participant and
 * is never pooled. A claim about a subject can never be marked shareable, so it
 * cannot enter a disclosure envelope, an introduction, or a match. And the
 * participant can empty the whole book in one action, because they are the
 * controller of it.
 */

export class SubjectError extends Error {}

export type SubjectKind = "person" | "organization";

export function normalizeSubjectName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export type SubjectSummary = {
  id: string;
  kind: SubjectKind;
  name: string;
  relationship: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  lastContactAt: string | null;
  /** Claims the participant has confirmed. */
  known: number;
  /** Claims still waiting on them. */
  pending: number;
};

/**
 * Open a dossier, or return the one already open.
 *
 * Idempotent on the name because the agent creates these mid-sentence. Someone
 * saying "note that Index asked about retention" twice should not end up with
 * two books on Index.
 */
export async function ensureSubject(
  participantId: string,
  input: { kind: SubjectKind; name: string; relationship?: string | null },
) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) {
    throw new SubjectError("A dossier needs a name between 2 and 120 characters.");
  }
  const database = getDatabase();
  const normalizedName = normalizeSubjectName(name);

  const [existing] = await database
    .select()
    .from(subjects)
    .where(
      and(
        eq(subjects.participantId, participantId),
        eq(subjects.normalizedName, normalizedName),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.archivedAt) {
      await database
        .update(subjects)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(eq(subjects.id, existing.id));
    }
    return { ...existing, created: false };
  }

  const [created] = await database
    .insert(subjects)
    .values({
      participantId,
      kind: input.kind,
      name,
      normalizedName,
      relationship: input.relationship?.trim().slice(0, 160) ?? null,
    })
    .returning();
  await recordAuditEvent({
    participantId,
    actorType: "participant",
    action: "subject.opened",
    entityType: "subject",
    entityId: created.id,
    metadata: { kind: input.kind },
  });
  return { ...created, created: true };
}

/**
 * Write a claim into a dossier.
 *
 * Forced private, and not as a default the caller may override. A shareable
 * claim is one Sylla may hand to another participant, and handing over what a
 * third party is alleged to have said or done is the one disclosure the consent
 * model has no standing to make.
 */
export async function recordSubjectClaim(input: {
  participantId: string;
  subjectId: string;
  claim: string;
  origin: "observed" | "inferred" | "told_to_me";
  evidenceExcerpt?: string | null;
  sourceId?: string | null;
  contact?: boolean;
}) {
  const database = getDatabase();
  const [subject] = await database
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.id, input.subjectId),
        eq(subjects.participantId, input.participantId),
      ),
    )
    .limit(1);
  if (!subject) throw new SubjectError("That dossier is not yours or does not exist.");

  const claim = input.claim.trim();
  if (claim.length < 3 || claim.length > 600) {
    throw new SubjectError("A note has to be between 3 and 600 characters.");
  }

  const [written] = await database
    .insert(observations)
    .values({
      participantId: input.participantId,
      subjectId: input.subjectId,
      claim,
      origin: input.origin,
      evidenceExcerpt: input.evidenceExcerpt?.slice(0, 1_000) ?? null,
      sourceId: input.sourceId ?? null,
      // Told to the agent by its own participant is theirs to assert; anything
      // the agent worked out or read still waits for a human to confirm it.
      status: input.origin === "told_to_me" ? "confirmed" : "pending",
      visibility: "private",
    })
    .returning();

  await database
    .update(subjects)
    .set({
      updatedAt: new Date(),
      ...(input.contact ? { lastContactAt: new Date() } : {}),
    })
    .where(eq(subjects.id, input.subjectId));

  return written;
}

export async function listSubjects(participantId: string): Promise<SubjectSummary[]> {
  const rows = await getDatabase()
    .select({
      id: subjects.id,
      kind: subjects.kind,
      name: subjects.name,
      relationship: subjects.relationship,
      nextAction: subjects.nextAction,
      nextActionAt: subjects.nextActionAt,
      lastContactAt: subjects.lastContactAt,
      updatedAt: subjects.updatedAt,
      known: sql<number>`count(${observations.id}) filter (where ${observations.status} in ('confirmed','edited'))`,
      pending: sql<number>`count(${observations.id}) filter (where ${observations.status} = 'pending')`,
    })
    .from(subjects)
    .leftJoin(observations, eq(observations.subjectId, subjects.id))
    .where(and(eq(subjects.participantId, participantId), isNull(subjects.archivedAt)))
    .groupBy(subjects.id)
    .orderBy(desc(subjects.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as SubjectKind,
    name: row.name,
    relationship: row.relationship,
    nextAction: row.nextAction,
    nextActionAt: row.nextActionAt?.toISOString() ?? null,
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    known: Number(row.known),
    pending: Number(row.pending),
  }));
}

export type DossierClaim = {
  id: string;
  claim: string;
  origin: string;
  status: string;
  evidenceExcerpt: string | null;
  observedAt: string;
};

export type Dossier = SubjectSummary & {
  claims: DossierClaim[];
  /** Stated on every read so no surface has to infer the fence. */
  privateToYou: true;
};

/** Everything known about one subject, newest first, with its provenance. */
export async function getDossier(
  participantId: string,
  subjectId: string,
): Promise<Dossier> {
  const database = getDatabase();
  const [subject] = await database
    .select()
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.participantId, participantId)))
    .limit(1);
  if (!subject) throw new SubjectError("That dossier is not yours or does not exist.");

  const claims = await database
    .select({
      id: observations.id,
      claim: observations.claim,
      origin: observations.origin,
      status: observations.status,
      evidenceExcerpt: observations.evidenceExcerpt,
      observedAt: observations.observedAt,
    })
    .from(observations)
    .where(eq(observations.subjectId, subjectId))
    .orderBy(desc(observations.observedAt));

  const live = claims.filter((one) => one.status !== "forgotten");
  return {
    id: subject.id,
    kind: subject.kind as SubjectKind,
    name: subject.name,
    relationship: subject.relationship,
    nextAction: subject.nextAction,
    nextActionAt: subject.nextActionAt?.toISOString() ?? null,
    lastContactAt: subject.lastContactAt?.toISOString() ?? null,
    known: live.filter((one) => one.status !== "pending").length,
    pending: live.filter((one) => one.status === "pending").length,
    claims: live.map((one) => ({
      id: one.id,
      claim: one.claim,
      origin: one.origin,
      status: one.status,
      evidenceExcerpt: one.evidenceExcerpt,
      observedAt: one.observedAt.toISOString(),
    })),
    privateToYou: true,
  };
}

export async function updateSubject(
  participantId: string,
  subjectId: string,
  input: { relationship?: string | null; nextAction?: string | null; nextActionAt?: Date | null },
) {
  const [updated] = await getDatabase()
    .update(subjects)
    .set({
      ...(input.relationship === undefined
        ? {}
        : { relationship: input.relationship?.trim().slice(0, 160) || null }),
      ...(input.nextAction === undefined
        ? {}
        : { nextAction: input.nextAction?.trim().slice(0, 200) || null }),
      ...(input.nextActionAt === undefined ? {} : { nextActionAt: input.nextActionAt }),
      updatedAt: new Date(),
    })
    .where(and(eq(subjects.id, subjectId), eq(subjects.participantId, participantId)))
    .returning({ id: subjects.id });
  if (!updated) throw new SubjectError("That dossier is not yours or does not exist.");
  return getDossier(participantId, subjectId);
}

/**
 * Close a dossier for good.
 *
 * A real delete rather than a flag, and the claims go with it through the
 * cascade. Someone who says "forget this person" about a record they keep on a
 * third party has asked for the strongest thing Sylla can do, and there is no
 * reason to hedge it.
 */
export async function deleteSubject(participantId: string, subjectId: string) {
  const [removed] = await getDatabase()
    .delete(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.participantId, participantId)))
    .returning({ id: subjects.id, name: subjects.name });
  if (!removed) throw new SubjectError("That dossier is not yours or does not exist.");
  await recordAuditEvent({
    participantId,
    actorType: "participant",
    action: "subject.deleted",
    entityType: "subject",
    entityId: subjectId,
    metadata: {},
  });
  return { deleted: true };
}
