import { z } from "zod";
import type { NextRequest } from "next/server";

import { getDatabase } from "@/db";
import { observations } from "@/db/schema";
import {
  jsonWithSession,
  loadSessionState,
  resolveParticipant,
} from "@/lib/sylla/session";

const proposedMemorySchema = z
  .object({
    proposedMemory: z.string().trim().min(3).max(280),
  })
  .strict();

export async function POST(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);

  try {
    const { proposedMemory } = proposedMemorySchema.parse(await request.json());
    await getDatabase().insert(observations).values({
      participantId: participant.id,
      claim: proposedMemory,
      evidenceExcerpt: null,
      origin: "told_to_me",
      status: "pending",
      visibility: "private",
      confidence: "high",
    });

    const state = await loadSessionState(participant.id);
    return jsonWithSession({ state }, newToken);
  } catch (error) {
    return jsonWithSession(
      {
        error:
          error instanceof Error
            ? error.message
            : "That exact memory proposal could not be saved.",
      },
      newToken,
      { status: 400 },
    );
  }
}
