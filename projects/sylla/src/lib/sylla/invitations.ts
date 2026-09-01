import { createHash, randomBytes } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  eventInvitations,
  events,
  participants,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import { recordAuditEvent } from "@/lib/sylla/participation";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function validToken(token: string) {
  return /^[A-Za-z0-9_-]{32,}$/.test(token);
}

export class InvitationUnavailableError extends Error {}

export async function createEventInvitation(input: {
  eventId: string;
  label?: string;
  maxUses?: number;
  expiresAt?: Date | null;
}) {
  const database = getDatabase();
  const [event] = await database
    .select()
    .from(events)
    .where(
      and(
        eq(events.id, input.eventId),
        inArray(events.status, ["draft", "open"]),
      ),
    )
    .limit(1);
  if (!event) throw new InvitationUnavailableError("Event is not accepting invitations.");
  const maxUses = Math.min(1_000, Math.max(1, Math.round(input.maxUses ?? 1)));
  if (input.expiresAt && input.expiresAt <= new Date()) {
    throw new InvitationUnavailableError("Invitation expiry must be in the future.");
  }
  const token = randomBytes(32).toString("base64url");
  const [invitation] = await database
    .insert(eventInvitations)
    .values({
      eventId: event.id,
      tokenHash: hashToken(token),
      label: input.label?.trim().slice(0, 120),
      maxUses,
      expiresAt: input.expiresAt,
    })
    .returning();
  await recordAuditEvent({
    eventId: event.id,
    actorType: "organizer",
    action: "event_invitation_created",
    entityType: "event_invitation",
    entityId: invitation.id,
    metadata: { maxUses, hasExpiry: Boolean(input.expiresAt) },
  });
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return {
    invitationId: invitation.id,
    token,
    url: new URL(`/join/${token}`, baseUrl).toString(),
    maxUses,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
  };
}

export async function redeemEventInvitation(token: string) {
  if (!validToken(token)) {
    throw new InvitationUnavailableError("Invitation is invalid.");
  }
  const database = getDatabase();
  const claimed = await database.execute<{
    invitation_id: string;
    event_id: string;
  }>(sql`
    update event_invitations as invitation
    set use_count = use_count + 1
    where token_hash = ${hashToken(token)}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
      and use_count < max_uses
      and exists (
        select 1 from events
        where events.id = invitation.event_id
          and events.status = 'open'
      )
    returning id as invitation_id, event_id
  `);
  const invitation = claimed.rows[0];
  if (!invitation) {
    throw new InvitationUnavailableError(
      "This invitation is expired, revoked, full, or the event is closed.",
    );
  }

  const sessionToken = randomBytes(32).toString("base64url");
  try {
    const [participant] = await database
      .insert(participants)
      .values({
        eventId: invitation.event_id,
        invitationId: invitation.invitation_id,
        inviteTokenHash: hashToken(sessionToken),
        ageConfirmed: false,
        status: "invited",
      })
      .returning();
    await ensurePortableIdentity(participant.id);
    await recordAuditEvent({
      eventId: invitation.event_id,
      participantId: participant.id,
      actorType: "participant",
      action: "event_invitation_redeemed",
      entityType: "event_invitation",
      entityId: invitation.invitation_id,
      metadata: {},
    });
    return { participantId: participant.id, sessionToken };
  } catch (error) {
    await database
      .update(eventInvitations)
      .set({ useCount: sql`greatest(0, ${eventInvitations.useCount} - 1)` })
      .where(eq(eventInvitations.id, invitation.invitation_id));
    throw error;
  }
}
