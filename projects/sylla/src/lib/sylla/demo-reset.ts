import { eq } from "drizzle-orm";

import { getDatabase } from "@/db";
import { events, participants } from "@/db/schema";
import { DEMO_EVENT_SLUG } from "@/lib/sylla/session";
import { eraseAgent } from "@/lib/sylla/portability";

/**
 * Starting the demo over.
 *
 * A demo leaves an agent full of the last run: a half-finished setup, someone
 * else's investor in the dossier, a boundary still up. Showing it again from
 * that state is showing a different product.
 *
 * The reset is a real erasure rather than a tidy-up, so what the next person
 * sees is genuinely a first session. Which is exactly why it is fenced to the
 * demo event: the same button in front of a member would be an unguarded
 * delete-everything, and the deliberate path for them already exists — it needs
 * a host lease and an exact confirmation phrase, and it should stay that hard.
 */
export class DemoResetError extends Error {}

export async function participantIsDemo(participantId: string) {
  const [row] = await getDatabase()
    .select({ slug: events.slug })
    .from(participants)
    .innerJoin(events, eq(events.id, participants.eventId))
    .where(eq(participants.id, participantId))
    .limit(1);
  return row?.slug === DEMO_EVENT_SLUG;
}

export async function resetDemoAgent(participantId: string) {
  if (!(await participantIsDemo(participantId))) {
    throw new DemoResetError(
      "This agent belongs to a real circle, so it cannot be reset. Deleting it is a deliberate action taken from your agent, not a button.",
    );
  }
  const erased = await eraseAgent(participantId);
  return { reset: true as const, ...erased };
}
