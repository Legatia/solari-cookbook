import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDatabase } from "@/db";
import { observations } from "@/db/schema";
import { observationUpdateSchema } from "@/lib/sylla/contracts";
import {
  jsonWithSession,
  loadSessionState,
  retireParticipantWorkspace,
  resolveParticipant,
} from "@/lib/sylla/session";

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/observations/[id]">,
) {
  const { participant, newToken } = await resolveParticipant(request);

  try {
    const { id } = await context.params;
    const update = observationUpdateSchema.parse(await request.json());
    const database = getDatabase();
    const [owned] = await database
      .select({ id: observations.id })
      .from(observations)
      .where(
        and(
          eq(observations.id, id),
          eq(observations.participantId, participant.id),
        ),
      )
      .limit(1);

    if (!owned) {
      return jsonWithSession(
        { error: "That memory was not found." },
        newToken,
        { status: 404 },
      );
    }

    await retireParticipantWorkspace(participant.id);
    const [changed] = await database
      .update(observations)
      .set(update)
      .where(
        and(
          eq(observations.id, id),
          eq(observations.participantId, participant.id),
        ),
      )
      .returning({ id: observations.id });

    if (!changed) {
      return jsonWithSession(
        { error: "That memory was not found." },
        newToken,
        { status: 404 },
      );
    }

    const state = await loadSessionState(participant.id);
    return jsonWithSession({ state }, newToken);
  } catch (error) {
    return jsonWithSession(
      {
        error:
          error instanceof Error ? error.message : "Memory could not be changed.",
      },
      newToken,
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/observations/[id]">,
) {
  const { participant, newToken } = await resolveParticipant(request);
  const { id } = await context.params;
  const database = getDatabase();
  const [owned] = await database
    .select({ id: observations.id })
    .from(observations)
    .where(
      and(
        eq(observations.id, id),
        eq(observations.participantId, participant.id),
      ),
    )
    .limit(1);

  if (!owned) {
    return jsonWithSession(
      { error: "That memory was not found." },
      newToken,
      { status: 404 },
    );
  }

  await retireParticipantWorkspace(participant.id);
  const [deleted] = await database
    .delete(observations)
    .where(
      and(
        eq(observations.id, id),
        eq(observations.participantId, participant.id),
      ),
    )
    .returning({ id: observations.id });

  if (!deleted) {
    return jsonWithSession(
      { error: "That memory was not found." },
      newToken,
      { status: 404 },
    );
  }

  const state = await loadSessionState(participant.id);
  return jsonWithSession({ state }, newToken);
}
