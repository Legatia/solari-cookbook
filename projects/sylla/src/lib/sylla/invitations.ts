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

/** Crockford base32: no I, L, O, or U, so a code read aloud survives being written down. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_GROUPS = 3;
const CODE_GROUP_LENGTH = 4;

function generateCode() {
  return Array.from({ length: CODE_GROUPS }, () =>
    Array.from(
      { length: CODE_GROUP_LENGTH },
      () => CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length],
    ).join(""),
  ).join("-");
}

/** Accepts the characters Crockford drops, so a human misreading still resolves. */
export function normalizeInvitationCode(raw: string) {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

function validCode(code: string) {
  return normalizeInvitationCode(code).length === CODE_GROUPS * CODE_GROUP_LENGTH;
}

/**
 * One invitation, two ways to present it.
 *
 * A link is what you paste into a chat; a code is what you say out loud. They
 * are the same invitation and draw on the same seat count, so a circle cannot
 * be quietly enlarged by handing out the other form.
 */
function credentialClause(credential: string) {
  return sql`(invitation.token_hash = ${hashToken(credential)} or invitation.code_hash = ${hashToken(normalizeInvitationCode(credential))})`;
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
  const code = generateCode();
  const [invitation] = await database
    .insert(eventInvitations)
    .values({
      eventId: event.id,
      tokenHash: hashToken(token),
      codeHash: hashToken(normalizeInvitationCode(code)),
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
    code,
    url: new URL(`/join/${token}`, baseUrl).toString(),
    maxUses,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
  };
}

export type InvitationPreview = {
  eventName: string;
  label: string | null;
  seatsRemaining: number;
  expiresAt: string | null;
};

/**
 * Read an invitation without spending it.
 *
 * The join link is shared in group chats, and every messenger that renders a
 * preview fetches the URL first. When redeeming was a plain GET, each of those
 * silently burned a seat and created an agent nobody asked for. Looking and
 * accepting are now different actions.
 */
export async function previewInvitation(
  credential: string,
): Promise<InvitationPreview> {
  if (!validToken(credential) && !validCode(credential)) {
    throw new InvitationUnavailableError("Invitation is invalid.");
  }
  const found = await getDatabase().execute<{
    label: string | null;
    max_uses: number;
    use_count: number;
    expires_at: Date | null;
    event_name: string;
  }>(sql`
    select invitation.label, invitation.max_uses, invitation.use_count,
           invitation.expires_at, events.name as event_name
    from event_invitations as invitation
    join events on events.id = invitation.event_id
    where ${credentialClause(credential)}
      and invitation.revoked_at is null
      and (invitation.expires_at is null or invitation.expires_at > now())
      and invitation.use_count < invitation.max_uses
      and events.status = 'open'
    limit 1
  `);
  const row = found.rows[0];
  if (!row) {
    throw new InvitationUnavailableError(
      "This invitation is expired, revoked, full, or the circle is closed.",
    );
  }
  return {
    eventName: row.event_name,
    label: row.label,
    seatsRemaining: row.max_uses - row.use_count,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  };
}

export async function redeemEventInvitation(token: string) {
  if (!validToken(token) && !validCode(token)) {
    throw new InvitationUnavailableError("Invitation is invalid.");
  }
  const database = getDatabase();
  const claimed = await database.execute<{
    invitation_id: string;
    event_id: string;
  }>(sql`
    update event_invitations as invitation
    set use_count = use_count + 1
    where ${credentialClause(token)}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
      and use_count < max_uses
      and exists (
        select 1 from events
        where events.id = invitation.event_id
          and events.status = 'open'
      )
    returning invitation.id as invitation_id, invitation.event_id
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
