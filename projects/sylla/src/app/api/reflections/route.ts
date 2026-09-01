import { z } from "zod";
import type { NextRequest } from "next/server";

import { getDatabase } from "@/db";
import { observations } from "@/db/schema";
import {
  jsonWithSession,
  loadSessionState,
  resolveParticipant,
} from "@/lib/sylla/session";

const reflectionSchema = z.object({
  reflection: z.string().trim().min(3).max(600),
});

export async function POST(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);

  try {
    const { reflection } = reflectionSchema.parse(await request.json());
    await getDatabase().insert(observations).values({
      participantId: participant.id,
      claim: reflection,
      evidenceExcerpt: reflection,
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
            : "That reflection could not be proposed as memory.",
      },
      newToken,
      { status: 400 },
    );
  }
}

