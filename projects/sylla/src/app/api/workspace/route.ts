import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { EntitlementRequiredError } from "@/lib/sylla/billing";
import {
  jsonWithSession,
  loadSessionState,
  retireParticipantWorkspace,
  resolveParticipant,
} from "@/lib/sylla/session";
import { withEphemeralRuntimeLease } from "@/lib/sylla/leases";
import {
  openParticipantWorkspace,
  pauseParticipantWorkspace,
  WorkspacePrerequisiteError,
} from "@/lib/sylla/workspace";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);

  try {
    const result = await withEphemeralRuntimeLease(
      participant.id,
      "open-workspace",
      (authorization) =>
        openParticipantWorkspace(participant.id, {
          authorization,
          idempotencyKey: `web:workspace-open:${randomUUID()}`,
        }),
    );
    return jsonWithSession(result, newToken);
  } catch (error) {
    if (error instanceof EntitlementRequiredError) {
      return jsonWithSession(
        {
          error: error.message,
          plan: error.summary,
          checkout: { url: error.checkoutUrl, hosted: true },
        },
        newToken,
        { status: 402 },
      );
    }
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
    const state = await withEphemeralRuntimeLease(
      participant.id,
      "pause-workspace",
      (authorization) =>
        pauseParticipantWorkspace(participant.id, {
          authorization,
          idempotencyKey: `web:workspace-pause:${randomUUID()}`,
        }),
      { allowTakeover: true },
    );
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
    await withEphemeralRuntimeLease(
      participant.id,
      "retire-workspace",
      () => retireParticipantWorkspace(participant.id),
      { allowTakeover: true },
    );
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
