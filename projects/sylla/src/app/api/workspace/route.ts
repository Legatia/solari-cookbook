import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDatabase } from "@/db";
import { agentWorkspaces, workspaceArtifacts } from "@/db/schema";
import { createSolariAdapters } from "@/lib/solari";
import {
  jsonWithSession,
  loadSessionState,
  retireParticipantWorkspace,
  resolveParticipant,
} from "@/lib/sylla/session";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);
  const database = getDatabase();
  const stateBefore = await loadSessionState(participant.id);
  const approved = stateBefore.observations.filter(
    (observation) => observation.status !== "pending",
  );

  if (!stateBefore.agentName || !stateBefore.focus || approved.length === 0) {
    return jsonWithSession(
      { error: "Approve at least one memory before opening the workspace." },
      newToken,
      { status: 400 },
    );
  }

  const adapters = await createSolariAdapters();
  const previous = stateBefore.workspace;

  if (previous?.provider === "solari" && previous.sessionId) {
    await adapters.desktop
      .destroy(previous.sessionId)
      .catch((error) => console.warn("Unable to replace old Desktop", error));
  }

  const now = new Date();
  const [workspace] = previous
    ? await database
        .update(agentWorkspaces)
        .set({ status: "starting", lastActiveAt: now })
        .where(eq(agentWorkspaces.id, previous.id))
        .returning()
    : await database
        .insert(agentWorkspaces)
        .values({
          participantId: participant.id,
          status: "starting",
          lastActiveAt: now,
        })
        .returning();

  try {
    const result = await adapters.desktop.provision({
      participantRef: participant.id,
      agentName: stateBefore.agentName,
      eventName: "Your private Sylla workspace",
      currentTask: `Understand what matters now: ${stateBefore.focus}`,
      artifactCount: stateBefore.sources.length,
      memoryCount: approved.length,
      observations: approved.map((observation) => ({
        id: observation.id,
        claim: observation.claim,
        origin: observation.origin,
        visibility: observation.visibility,
        sourceTitle: observation.sourceTitle,
        evidenceExcerpt: observation.evidenceExcerpt,
      })),
    });

    await database
      .update(agentWorkspaces)
      .set({
        provider: result.provider,
        solariDesktopSessionId: result.sessionId,
        status: result.status,
        lastActiveAt: new Date(),
        destroyedAt: null,
      })
      .where(eq(agentWorkspaces.id, workspace.id));
    await database
      .delete(workspaceArtifacts)
      .where(eq(workspaceArtifacts.workspaceId, workspace.id));
    await database.insert(workspaceArtifacts).values({
      workspaceId: workspace.id,
      kind: "approved-memory-board",
      title: `${stateBefore.agentName}'s current understanding`,
      payload: {
        focus: stateBefore.focus,
        sourceCount: stateBefore.sources.length,
        approvedMemories: approved,
      },
      sourceObservationIds: approved.map((observation) => observation.id),
    });

    const state = await loadSessionState(participant.id);
    return jsonWithSession(
      { state, streamCapability: result.streamCapability ?? null },
      newToken,
    );
  } catch (error) {
    await database
      .update(agentWorkspaces)
      .set({ status: "failed", lastActiveAt: new Date() })
      .where(eq(agentWorkspaces.id, workspace.id));
    console.error("Unable to provision Sylla workspace", error);
    return jsonWithSession(
      {
        error:
          error instanceof Error
            ? error.message
            : "The workspace could not be opened.",
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
    console.error("Unable to close Sylla workspace", error);
    return jsonWithSession(
      {
        error:
          error instanceof Error
            ? error.message
            : "The workspace could not be closed.",
      },
      newToken,
      { status: 500 },
    );
  }
}
