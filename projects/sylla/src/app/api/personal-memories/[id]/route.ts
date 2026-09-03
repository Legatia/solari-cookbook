import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDatabase } from "@/db";
import { participants, personalMemories } from "@/db/schema";
import { personalMemoryUpdateSchema } from "@/lib/sylla/contracts";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import { recordAuditEvent } from "@/lib/sylla/participation";
import {
  jsonWithSession,
  loadSessionState,
  retireParticipantWorkspace,
  resolveParticipant,
} from "@/lib/sylla/session";

async function ownedParticipantIds(participantId: string) {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const owned = await database
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.agentId, identity.agentId));
  return owned.map((participant) => participant.id);
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/personal-memories/[id]">,
) {
  const { participant, newToken } = await resolveParticipant(request);

  try {
    const { id } = await context.params;
    const update = personalMemoryUpdateSchema.parse(await request.json());
    const database = getDatabase();
    const participantIds = await ownedParticipantIds(participant.id);
    const [memory] = await database
      .select()
      .from(personalMemories)
      .where(
        and(
          eq(personalMemories.id, id),
          inArray(personalMemories.participantId, participantIds),
        ),
      )
      .limit(1);

    if (!memory || memory.status === "forgotten") {
      return jsonWithSession(
        { error: "That relationship memory was not found." },
        newToken,
        { status: 404 },
      );
    }

    const now = new Date();
    await retireParticipantWorkspace(participant.id);
    await database
      .update(personalMemories)
      .set({
        ...(update.decision === "forget"
          ? { status: "forgotten" as const, forgottenAt: now }
          : update.decision
            ? {
                status:
                  update.decision === "edit"
                    ? ("edited" as const)
                    : ("approved" as const),
                ...(update.editedSummary
                  ? { summary: update.editedSummary }
                  : {}),
                approvedAt: now,
                forgottenAt: null,
              }
            : {}),
        ...(update.visibility ? { visibility: update.visibility } : {}),
      })
      .where(eq(personalMemories.id, memory.id));

    await recordAuditEvent({
      participantId: participant.id,
      actorType: "participant",
      action:
        update.decision === "forget"
          ? "personal_memory_forgotten"
          : "personal_memory_updated",
      entityType: "personal_memory",
      entityId: memory.id,
      metadata: {
        decision: update.decision ?? "visibility_only",
        visibility: update.visibility ?? memory.visibility,
        rawDebriefPersisted: false,
      },
    });

    return jsonWithSession(
      { state: await loadSessionState(participant.id) },
      newToken,
    );
  } catch (error) {
    return jsonWithSession(
      {
        error:
          error instanceof Error
            ? error.message
            : "Relationship memory could not be changed.",
      },
      newToken,
      { status: 400 },
    );
  }
}
