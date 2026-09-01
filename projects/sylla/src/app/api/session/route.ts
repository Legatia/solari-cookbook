import type { NextRequest } from "next/server";

import {
  jsonWithSession,
  loadSessionState,
  resolveParticipant,
} from "@/lib/sylla/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const state = await loadSessionState(participant.id);
    return jsonWithSession({ state }, newToken);
  } catch (error) {
    console.error("Unable to load Sylla session", error);
    return Response.json(
      { error: "Your Sylla session could not be opened. Please try again." },
      { status: 500 },
    );
  }
}

