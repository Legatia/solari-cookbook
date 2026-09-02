import { eq } from "drizzle-orm";

import { getDatabase } from "@/db";
import { observations, participants } from "@/db/schema";
import {
  recordAuditEvent,
  requireParticipationCapability,
} from "@/lib/sylla/participation";

export async function proposeConversationMemory(input: {
  participantId: string;
  summary: string;
  visibility: "private" | "shareable";
}) {
  await requireParticipationCapability(input.participantId, "privateMemoryStorage");
  const database = getDatabase();
  const [participant] = await database
    .select({ eventId: participants.eventId })
    .from(participants)
    .where(eq(participants.id, input.participantId))
    .limit(1);
  if (!participant) throw new Error("The Sylla participant no longer exists.");

  const [memory] = await database
    .insert(observations)
    .values({
      participantId: input.participantId,
      claim: input.summary.trim(),
      origin: "told_to_me",
      status: "pending",
      visibility: input.visibility,
      confidence: "participant-stated",
    })
    .returning();
  if (!memory) throw new Error("The memory proposal could not be created.");

  await recordAuditEvent({
    eventId: participant.eventId,
    participantId: input.participantId,
    actorType: "participant",
    action: "conversation_memory_proposed",
    entityType: "observation",
    entityId: memory.id,
    metadata: { visibility: input.visibility, approvalRequired: true },
  });

  return {
    id: memory.id,
    summary: memory.claim,
    status: memory.status,
    visibility: memory.visibility,
    approvalRequired: true,
  };
}
