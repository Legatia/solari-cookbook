import { and, eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db";
import { observations, participants } from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import { recordAuditEvent } from "@/lib/sylla/participation";
import {
  loadSessionState,
  retireParticipantWorkspace,
} from "@/lib/sylla/session";

export type ObservationReviewInput = {
  participantId: string;
  observationId: string;
  decision: "approve" | "edit" | "set_visibility" | "forget";
  editedClaim?: string;
  visibility?: "private" | "shareable";
};

export async function reviewObservation(input: ObservationReviewInput) {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(input.participantId);
  const ownedParticipants = await database
    .select({ id: participants.id, eventId: participants.eventId })
    .from(participants)
    .where(eq(participants.agentId, identity.agentId));
  const participantIds = ownedParticipants.map((participant) => participant.id);
  const [owned] = await database
    .select({
      id: observations.id,
      participantId: observations.participantId,
      status: observations.status,
    })
    .from(observations)
    .where(
      and(
        eq(observations.id, input.observationId),
        inArray(observations.participantId, participantIds),
      ),
    )
    .limit(1);

  if (!owned) throw new Error("That memory was not found.");

  const editedClaim = input.editedClaim?.trim();
  if (
    input.decision === "edit" &&
    (!editedClaim || editedClaim.length < 3 || editedClaim.length > 600)
  ) {
    throw new Error("An edited memory must contain 3 to 600 characters.");
  }
  if (input.decision !== "edit" && editedClaim) {
    throw new Error("Only an edit may include a replacement memory.");
  }
  if (input.decision === "set_visibility" && !input.visibility) {
    throw new Error("A visibility choice is required.");
  }
  if (input.decision !== "set_visibility" && input.visibility) {
    throw new Error("Visibility may only be supplied when changing visibility.");
  }
  if (input.decision === "approve" && owned.status !== "pending") {
    throw new Error("Only a pending memory proposal can be approved.");
  }

  await retireParticipantWorkspace(input.participantId);

  if (input.decision === "forget") {
    await database
      .delete(observations)
      .where(
        and(
          eq(observations.id, input.observationId),
          inArray(observations.participantId, participantIds),
        ),
      );
  } else {
    await database
      .update(observations)
      .set(
        input.decision === "approve"
          ? { status: "confirmed" }
          : input.decision === "edit"
            ? { claim: editedClaim, status: "edited" }
            : { visibility: input.visibility },
      )
      .where(
        and(
          eq(observations.id, input.observationId),
          inArray(observations.participantId, participantIds),
        ),
      );
  }

  await recordAuditEvent({
    eventId:
      ownedParticipants.find(
        (participant) => participant.id === owned.participantId,
      )?.eventId ?? null,
    participantId: input.participantId,
    actorType: "participant",
    action: `observation_${input.decision}`,
    entityType: "observation",
    entityId: input.observationId,
    metadata: {
      edited: input.decision === "edit",
      forgotten: input.decision === "forget",
      visibility: input.visibility ?? null,
    },
  });

  return loadSessionState(input.participantId);
}
