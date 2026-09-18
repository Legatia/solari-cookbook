import type { NextRequest } from "next/server";

import { listIntroductionsForParticipant } from "@/lib/sylla/introductions";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

export const dynamic = "force-dynamic";

/** Private, non-identifying introduction inbox for the participant's control room. */
export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(
      await listIntroductionsForParticipant(participant.id),
      newToken,
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Your private introductions could not be loaded.",
      },
      { status: 400 },
    );
  }
}
