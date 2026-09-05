import { and, count, eq, gt, isNull, or } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  candidatePairs,
  introductionProposals,
  participantBoundaries,
  shieldDeclines,
} from "@/db/schema";
import { recordAuditEvent } from "@/lib/sylla/participation";

/**
 * The agent as a shield.
 *
 * Most of Sylla is about finding people. This is the opposite and it is the
 * part a member feels first: not having to say no themselves. A boundary is a
 * standing refusal their agent applies on their behalf, before anything reaches
 * them and without them being asked.
 *
 * Two properties make it a shield rather than a filter.
 *
 * The person turned away learns nothing. A boundary refusal is reported with
 * the same generic message the gate already gives for every other reason a pair
 * is not proposable, so "they have a rule about people like you" is not
 * inferable from the outside — and unlike a real decline it does not consume
 * the pair, so nothing is destroyed by a boundary that was only ever meant to
 * mean "not now".
 *
 * The member can always look. Everything refused is recorded for them, because
 * a boundary nobody can inspect stops being protection and becomes an algorithm
 * quietly deciding who they meet.
 */

export type BoundaryKind = "paused" | "mutual_only" | "weekly_limit";

export class BoundaryError extends Error {}

const DEFAULT_WEEKLY_LIMIT = 3;
const MAX_WEEKLY_LIMIT = 50;

export type Boundary = {
  kind: BoundaryKind;
  threshold: number | null;
  until: string | null;
  createdAt: string;
  /** Plain-language statement of what this refuses, in the member's own terms. */
  says: string;
};

function describe(kind: BoundaryKind, threshold: number | null, until: Date | null) {
  if (kind === "paused") {
    return until
      ? `Nothing reaches me until ${until.toLocaleDateString(undefined, { day: "numeric", month: "long" })}.`
      : "Nothing reaches me until I say otherwise.";
  }
  if (kind === "mutual_only") {
    return "Only when both agents arrived at it independently — no cold approaches.";
  }
  return `At most ${threshold ?? DEFAULT_WEEKLY_LIMIT} a week.`;
}

/** Boundaries currently in force, with any self-expiring ones already dropped. */
export async function activeBoundaries(participantId: string): Promise<Boundary[]> {
  const rows = await getDatabase()
    .select()
    .from(participantBoundaries)
    .where(
      and(
        eq(participantBoundaries.participantId, participantId),
        isNull(participantBoundaries.releasedAt),
        or(
          isNull(participantBoundaries.until),
          gt(participantBoundaries.until, new Date()),
        ),
      ),
    );
  return rows.map((row) => ({
    kind: row.kind as BoundaryKind,
    threshold: row.threshold,
    until: row.until?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    says: describe(row.kind as BoundaryKind, row.threshold, row.until),
  }));
}

/**
 * Put a boundary in place, replacing any earlier one of the same kind.
 *
 * Replacing rather than stacking: a member who says "pause me until Friday"
 * after saying "pause me until Tuesday" means one thing, and two live pauses
 * would make the answer to "what am I refusing?" ambiguous.
 */
export async function setBoundary(
  participantId: string,
  input: { kind: BoundaryKind; threshold?: number | null; until?: Date | null },
) {
  if (input.kind === "weekly_limit") {
    const threshold = input.threshold ?? DEFAULT_WEEKLY_LIMIT;
    if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > MAX_WEEKLY_LIMIT) {
      throw new BoundaryError(
        `A weekly limit has to be a whole number between 0 and ${MAX_WEEKLY_LIMIT}.`,
      );
    }
  }
  if (input.until && input.until <= new Date()) {
    throw new BoundaryError("A boundary that lifts in the past would do nothing.");
  }

  const database = getDatabase();
  await database
    .update(participantBoundaries)
    .set({ releasedAt: new Date() })
    .where(
      and(
        eq(participantBoundaries.participantId, participantId),
        eq(participantBoundaries.kind, input.kind),
        isNull(participantBoundaries.releasedAt),
      ),
    );
  await database.insert(participantBoundaries).values({
    participantId,
    kind: input.kind,
    threshold:
      input.kind === "weekly_limit" ? (input.threshold ?? DEFAULT_WEEKLY_LIMIT) : null,
    until: input.kind === "paused" ? (input.until ?? null) : null,
  });

  await recordAuditEvent({
    participantId,
    actorType: "participant",
    action: "boundary.set",
    entityType: "participant",
    entityId: participantId,
    metadata: { kind: input.kind },
  });
  return activeBoundaries(participantId);
}

/** Take a boundary back down. */
export async function releaseBoundary(participantId: string, kind: BoundaryKind) {
  const [released] = await getDatabase()
    .update(participantBoundaries)
    .set({ releasedAt: new Date() })
    .where(
      and(
        eq(participantBoundaries.participantId, participantId),
        eq(participantBoundaries.kind, kind),
        isNull(participantBoundaries.releasedAt),
      ),
    )
    .returning({ id: participantBoundaries.id });
  if (!released) throw new BoundaryError("That boundary is not in place.");
  await recordAuditEvent({
    participantId,
    actorType: "participant",
    action: "boundary.released",
    entityType: "participant",
    entityId: participantId,
    metadata: { kind },
  });
  return activeBoundaries(participantId);
}

export type ShieldVerdict =
  | { refused: false }
  | { refused: true; kind: BoundaryKind };

/**
 * Whether anything reaching this member should be turned away.
 *
 * Called for the person being approached, never the one approaching: a shield
 * governs what arrives, not what someone may attempt.
 */
export async function evaluateShield(
  recipientParticipantId: string,
  input: { originTier: "mutual" | "one_sided" },
): Promise<ShieldVerdict> {
  const boundaries = await activeBoundaries(recipientParticipantId);
  if (boundaries.some((boundary) => boundary.kind === "paused")) {
    return { refused: true, kind: "paused" };
  }
  if (
    input.originTier === "one_sided" &&
    boundaries.some((boundary) => boundary.kind === "mutual_only")
  ) {
    return { refused: true, kind: "mutual_only" };
  }

  const limit = boundaries.find((boundary) => boundary.kind === "weekly_limit");
  if (limit) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
    // Only what actually reached them counts. Refusals are not arrivals, or a
    // full week would keep itself full forever.
    const [reached] = await getDatabase()
      .select({ total: count() })
      .from(introductionProposals)
      .innerJoin(
        candidatePairs,
        eq(introductionProposals.candidatePairId, candidatePairs.id),
      )
      .where(
        and(
          or(
            eq(candidatePairs.participantLowId, recipientParticipantId),
            eq(candidatePairs.participantHighId, recipientParticipantId),
          ),
          gt(introductionProposals.createdAt, since),
        ),
      );
    if (Number(reached?.total ?? 0) >= (limit.threshold ?? DEFAULT_WEEKLY_LIMIT)) {
      return { refused: true, kind: "weekly_limit" };
    }
  }
  return { refused: false };
}

/** Record a refusal so the member can review what their shield did. */
export async function recordShieldDecline(input: {
  participantId: string;
  candidatePairId: string;
  kind: BoundaryKind;
  originTier: "mutual" | "one_sided";
}) {
  await getDatabase().insert(shieldDeclines).values({
    participantId: input.participantId,
    candidatePairId: input.candidatePairId,
    kind: input.kind,
    originTier: input.originTier,
  });
}

export type ShieldReview = {
  boundaries: Boundary[];
  turnedAwayTotal: number;
  turnedAwayThisWeek: number;
  /** How many different people, rather than how many attempts. */
  distinctPeople: number;
  byBoundary: Record<string, number>;
  mostRecentAt: string | null;
};

/**
 * What the shield has been doing.
 *
 * Reported as counts and never as identities: the member declined these without
 * ever being asked, so learning who they were would hand them exactly the
 * decision the boundary existed to spare them.
 */
export async function reviewShield(participantId: string): Promise<ShieldReview> {
  const database = getDatabase();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
  const rows = await database
    .select({
      kind: shieldDeclines.kind,
      occurredAt: shieldDeclines.occurredAt,
      candidatePairId: shieldDeclines.candidatePairId,
    })
    .from(shieldDeclines)
    .where(eq(shieldDeclines.participantId, participantId));

  const byBoundary: Record<string, number> = {};
  for (const row of rows) {
    byBoundary[row.kind] = (byBoundary[row.kind] ?? 0) + 1;
  }
  const times = rows.map((row) => row.occurredAt.getTime());
  return {
    boundaries: await activeBoundaries(participantId),
    turnedAwayTotal: rows.length,
    turnedAwayThisWeek: rows.filter((row) => row.occurredAt > since).length,
    distinctPeople: new Set(rows.map((row) => row.candidatePairId)).size,
    byBoundary,
    mostRecentAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}
