import "../env-config";

import { desc, eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import { eventInvitations, events, participants } from "../src/db/schema";

/**
 * Who is actually in the circle.
 *
 * Seats spent and people present are different numbers — someone can open an
 * invitation and never consent — so both are shown rather than one standing in
 * for the other.
 */
async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error("Usage: pnpm circle:status <event-slug>");
  const database = getDatabase();
  const [event] = await database
    .select()
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);
  if (!event) throw new Error(`No circle with the slug "${slug}".`);

  const invitations = await database
    .select({
      label: eventInvitations.label,
      maxUses: eventInvitations.maxUses,
      useCount: eventInvitations.useCount,
      expiresAt: eventInvitations.expiresAt,
      revokedAt: eventInvitations.revokedAt,
    })
    .from(eventInvitations)
    .where(eq(eventInvitations.eventId, event.id))
    .orderBy(desc(eventInvitations.createdAt));

  const members = await database
    .select({
      id: participants.id,
      displayName: participants.displayName,
      status: participants.status,
      joinedAt: participants.createdAt,
    })
    .from(participants)
    .where(eq(participants.eventId, event.id))
    .orderBy(desc(participants.createdAt));

  console.log(
    JSON.stringify(
      {
        circle: { slug, name: event.name, status: event.status },
        seats: invitations.map((invitation) => ({
          label: invitation.label,
          used: invitation.useCount,
          of: invitation.maxUses,
          remaining: invitation.maxUses - invitation.useCount,
          expiresAt: invitation.expiresAt?.toISOString() ?? null,
          revoked: Boolean(invitation.revokedAt),
        })),
        seatsSpent: invitations.reduce((total, one) => total + one.useCount, 0),
        peoplePresent: members.filter((one) => one.status !== "invited").length,
        members: members.map((member) => ({
          name: member.displayName ?? "(has not introduced themselves yet)",
          status: member.status,
          joinedAt: member.joinedAt.toISOString(),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
