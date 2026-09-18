import { and, eq, isNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import { eventInvitations, participants } from "@/db/schema";
import { createEventInvitation } from "@/lib/sylla/invitations";
import { recordAuditEvent } from "@/lib/sylla/participation";

/**
 * Members vouching for members.
 *
 * The reward for a referral that lands is another referral, and deliberately
 * nothing else. Paying credits for invitations would turn vouching into
 * farming: the fastest way to earn would be to invite anyone at all, which
 * destroys the only thing an invite-only society has — that someone who is
 * already here is willing to stake a seat on you.
 *
 * Earned seats also cannot be manufactured. A seat is returned only when the
 * person invited consents in their own right, which needs a real human making
 * a real decision, not a redemption.
 *
 * There is a further reason not to pay: in a coordination network the person
 * you bring in *is* the reward. Every use case here works better when the
 * circle contains people you actually know.
 */

/** What a member starts with, once they have consented themselves. */
const BASE_SEATS = 3;
/** Ceiling on total seats ever granted to one member, earned ones included. */
const MAX_SEATS = 10;
/** An unspent seat returns after this long, so a forgotten invite is not lost. */
const SEAT_TTL_HOURS = 14 * 24;

export class ReferralError extends Error {}

/**
 * Statuses that mean this person decided to be here, rather than merely arrived.
 *
 * "invited" is the state a redemption alone produces, so it is deliberately not
 * here: if opening a link earned the inviter a seat, the loop would reward
 * sending links rather than vouching for people. "withdrawn" is excluded
 * because someone who left should not keep funding invitations.
 */
const PRESENT: string[] = ["onboarding", "ready"];

export type ReferralAllowance = {
  granted: number;
  base: number;
  earned: number;
  spent: number;
  remaining: number;
  atCeiling: boolean;
};

async function requireMember(participantId: string) {
  const [member] = await getDatabase()
    .select({
      id: participants.id,
      eventId: participants.eventId,
      status: participants.status,
      displayName: participants.displayName,
    })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!member) throw new ReferralError("No such member.");
  return member;
}

/**
 * How many seats this member may still hand out.
 *
 * Seats are counted as spent while an invitation is live or has been redeemed.
 * One that expired unused, or that the member revoked, returns to them: the
 * intent is to bound how many people you can vouch for, not to punish an
 * invitation nobody opened.
 */
export async function referralAllowance(
  participantId: string,
): Promise<ReferralAllowance> {
  const member = await requireMember(participantId);
  const database = getDatabase();

  // Consent first. An agent that exists but has never agreed to anything
  // cannot start handing out seats.
  const consented = PRESENT.includes(member.status);

  const [counts] = await database
    .select({
      spent: sql<number>`count(*) filter (where ${eventInvitations.revokedAt} is null and (${eventInvitations.useCount} > 0 or ${eventInvitations.expiresAt} > now()))`,
      landed: sql<number>`count(distinct ${participants.id}) filter (where ${participants.status} in ${PRESENT})`,
    })
    .from(eventInvitations)
    .leftJoin(participants, eq(participants.invitationId, eventInvitations.id))
    .where(eq(eventInvitations.createdByParticipantId, participantId));

  const base = consented ? BASE_SEATS : 0;
  const earned = consented ? Number(counts?.landed ?? 0) : 0;
  const granted = Math.min(MAX_SEATS, base + earned);
  const spent = Number(counts?.spent ?? 0);
  return {
    granted,
    base,
    earned,
    spent,
    remaining: Math.max(0, granted - spent),
    atCeiling: base + earned >= MAX_SEATS,
  };
}

/**
 * Spend one seat on someone.
 *
 * Single use and time bounded: a member vouches for a person, not for a link
 * that can be forwarded onward indefinitely.
 */
export async function createReferralInvitation(participantId: string, label?: string) {
  const member = await requireMember(participantId);
  const allowance = await referralAllowance(participantId);
  if (allowance.granted === 0) {
    throw new ReferralError(
      "Finish your own setup first — Sylla asks you to consent before you can vouch for anyone.",
    );
  }
  if (allowance.remaining <= 0) {
    throw new ReferralError(
      allowance.atCeiling
        ? "You have handed out every seat you have. They come back as the people you invited settle in."
        : "You have no seats left right now. One returns when an unused invitation expires, or when someone you invited joins properly.",
    );
  }

  const invitation = await createEventInvitation({
    eventId: member.eventId,
    label: label?.trim().slice(0, 80) || `Invited by ${member.displayName ?? "a member"}`,
    maxUses: 1,
    expiresAt: new Date(Date.now() + SEAT_TTL_HOURS * 60 * 60 * 1_000),
    createdByParticipantId: participantId,
  });

  await recordAuditEvent({
    eventId: member.eventId,
    participantId,
    actorType: "participant",
    action: "referral_invitation_created",
    entityType: "event_invitation",
    entityId: invitation.invitationId,
    metadata: { seatsRemaining: allowance.remaining - 1 },
  });

  return invitation;
}

export type ReferralRecord = {
  invitationId: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  redeemed: boolean;
  /** Whether the person who used it went on to consent in their own right. */
  settledIn: boolean;
  /** Only ever a display name the invitee chose for themselves. */
  who: string | null;
};

/**
 * The member's own referrals.
 *
 * Shows whether an invitation was used and whether that person stayed, because
 * a seat that returns is the only feedback that makes the loop legible. It
 * never exposes anything about the invitee beyond a name they chose.
 */
export async function listReferrals(participantId: string): Promise<ReferralRecord[]> {
  const rows = await getDatabase()
    .select({
      invitationId: eventInvitations.id,
      label: eventInvitations.label,
      createdAt: eventInvitations.createdAt,
      expiresAt: eventInvitations.expiresAt,
      revokedAt: eventInvitations.revokedAt,
      useCount: eventInvitations.useCount,
      inviteeStatus: participants.status,
      inviteeName: participants.displayName,
    })
    .from(eventInvitations)
    .leftJoin(participants, eq(participants.invitationId, eventInvitations.id))
    .where(eq(eventInvitations.createdByParticipantId, participantId));

  return rows.map((row) => ({
    invitationId: row.invitationId,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revoked: Boolean(row.revokedAt),
    redeemed: row.useCount > 0,
    settledIn: Boolean(row.inviteeStatus && PRESENT.includes(row.inviteeStatus)),
    who: row.inviteeName,
  }));
}

/**
 * Take back an invitation that has not been used.
 *
 * A redeemed one is deliberately not revocable here: that person now has their
 * own agent, and withdrawing someone else's account is not a referral action.
 */
export async function revokeReferralInvitation(
  participantId: string,
  invitationId: string,
) {
  const [revoked] = await getDatabase()
    .update(eventInvitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(eventInvitations.id, invitationId),
        eq(eventInvitations.createdByParticipantId, participantId),
        isNull(eventInvitations.revokedAt),
        eq(eventInvitations.useCount, 0),
      ),
    )
    .returning({ id: eventInvitations.id });
  if (!revoked) {
    throw new ReferralError(
      "That invitation is already used, already withdrawn, or not yours.",
    );
  }
  await recordAuditEvent({
    participantId,
    actorType: "participant",
    action: "referral_invitation_revoked",
    entityType: "event_invitation",
    entityId: invitationId,
    metadata: {},
  });
  return { revoked: true };
}
