import type { NextRequest } from "next/server";

import { passkeyStatus } from "@/lib/sylla/passkeys";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(
      { status: await passkeyStatus(participant.id) },
      newToken,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Account status failed." },
      { status: 401 },
    );
  }
}
