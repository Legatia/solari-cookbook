import type { NextRequest } from "next/server";

import {
  jsonWithSession,
  loadSessionState,
  retireParticipantWorkspace,
  resolveParticipant,
} from "@/lib/sylla/session";
import {
  openParticipantWorkspace,
  pauseParticipantWorkspace,
  WorkspacePrerequisiteError,
} from "@/lib/sylla/workspace";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);

  try {
    const result = await openParticipantWorkspace(participant.id);
    return jsonWithSession(result, newToken);
  } catch (error) {
    console.error("Unable to provision Sylla workspace", error);
    return jsonWithSession(
      {
        error:
          error instanceof Error
            ? error.message
            : "The workspace could not be opened.",
      },
      newToken,
      { status: error instanceof WorkspacePrerequisiteError ? 400 : 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);

  try {
    const state = await pauseParticipantWorkspace(participant.id);
    return jsonWithSession({ state }, newToken);
  } catch (error) {
    console.error("Unable to pause Sylla workspace", error);
    return jsonWithSession(
      {
        error:
          error instanceof Error
            ? error.message
            : "The workspace could not be paused.",
      },
      newToken,
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);

  try {
    await retireParticipantWorkspace(participant.id);
    const state = await loadSessionState(participant.id);
    return jsonWithSession({ state }, newToken);
  } catch (error) {
    console.error("Unable to retire Sylla workspace", error);
    return jsonWithSession(
      {
        error:
          error instanceof Error
            ? error.message
            : "The workspace could not be retired.",
      },
      newToken,
      { status: 500 },
    );
  }
}
