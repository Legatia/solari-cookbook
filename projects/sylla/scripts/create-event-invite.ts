import "../env-config";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import { events } from "../src/db/schema";
import { createEventInvitation } from "../src/lib/sylla/invitations";

async function main() {
  const [slug, name, rawMaxUses = "40", rawHours = "168"] = process.argv.slice(2);
  if (!slug || !name) {
    throw new Error(
      'Usage: pnpm invite:create <event-slug> "Event name" [max-uses] [hours-valid]',
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Event slug must contain lowercase letters, numbers, and hyphens.");
  }
  const maxUses = Number.parseInt(rawMaxUses, 10);
  const hours = Number.parseInt(rawHours, 10);
  if (!Number.isSafeInteger(maxUses) || !Number.isSafeInteger(hours)) {
    throw new Error("max-uses and hours-valid must be integers.");
  }
  const database = getDatabase();
  const [created] = await database
    .insert(events)
    .values({ slug, name, status: "open" })
    .onConflictDoNothing({ target: events.slug })
    .returning();
  const [event] = created
    ? [created]
    : await database.select().from(events).where(eq(events.slug, slug)).limit(1);
  if (!event) throw new Error("Event could not be created or loaded.");
  const invitation = await createEventInvitation({
    eventId: event.id,
    label: `${name} participant invitation`,
    maxUses,
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1_000),
  });
  console.log(JSON.stringify({ eventId: event.id, slug, ...invitation }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
