import { eq } from "drizzle-orm";

import { getDatabase } from "@/db";
import { agentWorkspaces, workspaceArtifacts } from "@/db/schema";
import { createSolariAdapters } from "@/lib/solari";
import type {
  SolariAdapters,
  WorkspaceManifest,
  WorkspaceResult,
} from "@/lib/solari/contracts";
import type { SyllaSessionState } from "@/lib/sylla/contracts";
import {
  releaseBillableOperation,
  reserveBillableOperation,
  settleBillableOperation,
} from "@/lib/sylla/billing";
import {
  requireRuntimeLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import { loadSessionState } from "@/lib/sylla/session";

export type OpenWorkspaceResult = {
  state: SyllaSessionState;
  streamCapability: string | null;
};

export class WorkspacePrerequisiteError extends Error {}

export type WorkspaceOperationContext = {
  authorization: RuntimeLeaseAuthorization;
  idempotencyKey: string;
  adapters?: SolariAdapters;
};

function approvedWorkspaceManifest(state: SyllaSessionState): WorkspaceManifest {
  const approved = state.observations.filter(
    (observation) => observation.status !== "pending",
  );

  if (!state.agentName || !state.focus || approved.length === 0) {
    throw new WorkspacePrerequisiteError(
      "Approve at least one memory before opening the workspace.",
    );
  }

  return {
    participantRef: state.participantId,
    agentName: state.agentName,
    eventName: "Your private Sylla workspace",
    currentTask: `Understand what matters now: ${state.focus}`,
    artifactCount: state.sources.length,
    memoryCount: approved.length,
    observations: approved.map((observation) => ({
      id: observation.id,
      claim: observation.claim,
      origin: observation.origin,
      visibility: observation.visibility,
      sourceTitle: observation.sourceTitle,
      evidenceExcerpt: observation.evidenceExcerpt,
    })),
  };
}

export async function openParticipantWorkspace(
  participantId: string,
  context: WorkspaceOperationContext,
): Promise<OpenWorkspaceResult> {
  const database = getDatabase();
  await requireRuntimeLease(participantId, context.authorization);
  const stateBefore = await loadSessionState(participantId);
  const manifest = approvedWorkspaceManifest(stateBefore);
  const operation = stateBefore.workspace?.sessionId
    ? "workspace_resume"
    : "workspace_open";
  const reservation = await reserveBillableOperation({
    participantId,
    operation,
    idempotencyKey: context.idempotencyKey,
  });

  if (reservation.alreadyProcessed) {
    return { state: stateBefore, streamCapability: null };
  }

  const previous = stateBefore.workspace;
  let volumeId = previous?.volumeId ?? null;
  let workspaceId: string | undefined;
  let provisioned: WorkspaceResult;

  try {
    const solari = context.adapters ?? (await createSolariAdapters());
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
            participantId,
            agentId: stateBefore.identity.agentId,
            status: "starting",
            lastActiveAt: now,
          })
          .returning();
    workspaceId = workspace.id;

    if (!volumeId) {
      volumeId = await solari.desktop.createVolume(participantId);
      await database
        .update(agentWorkspaces)
        .set({ solariVolumeId: volumeId })
        .where(eq(agentWorkspaces.id, workspace.id));
    }

    provisioned = await solari.desktop.provision(manifest, {
      volumeId,
      sessionId:
        previous?.status === "destroyed" ? null : previous?.sessionId ?? null,
    });

    await database
      .update(agentWorkspaces)
      .set({
        provider: provisioned.provider,
        solariDesktopSessionId: provisioned.sessionId,
        solariVolumeId: provisioned.volumeId,
        solariSnapshotId: provisioned.snapshotId,
        status: provisioned.status,
        lastActiveAt: new Date(),
        pausedAt: null,
        destroyedAt: null,
      })
      .where(eq(agentWorkspaces.id, workspace.id));
    await database
      .delete(workspaceArtifacts)
      .where(eq(workspaceArtifacts.workspaceId, workspace.id));
    await database.insert(workspaceArtifacts).values({
      workspaceId: workspace.id,
      kind: "approved-memory-board",
      title: `${manifest.agentName}'s current understanding`,
      payload: {
        focus: stateBefore.focus,
        sourceCount: stateBefore.sources.length,
        approvedMemories: manifest.observations,
      },
      sourceObservationIds: manifest.observations.map(
        (observation) => observation.id,
      ),
    });

  } catch (error) {
    if (workspaceId) {
      await database
        .update(agentWorkspaces)
        .set({
          solariVolumeId: volumeId,
          status: "failed",
          lastActiveAt: new Date(),
        })
        .where(eq(agentWorkspaces.id, workspaceId));
    }
    await releaseBillableOperation(reservation);
    throw error;
  }

  await settleBillableOperation(reservation, provisioned.sessionId);
  return {
    state: await loadSessionState(participantId),
    streamCapability: provisioned.streamCapability ?? null,
  };
}

export async function checkpointParticipantWorkspace(
  participantId: string,
  context: WorkspaceOperationContext,
) {
  const database = getDatabase();
  await requireRuntimeLease(participantId, context.authorization);
  const state = await loadSessionState(participantId);
  const workspace = state.workspace;

  if (!workspace?.sessionId) {
    throw new Error("Open the agent workspace before checkpointing it.");
  }

  const reservation = await reserveBillableOperation({
    participantId,
    operation: "workspace_checkpoint",
    idempotencyKey: context.idempotencyKey,
  });

  if (reservation.alreadyProcessed) return state;

  let snapshotId: string;
  try {
    const solari = context.adapters ?? (await createSolariAdapters());
    snapshotId = await solari.desktop.checkpoint(
      workspace.sessionId,
      "sylla-user-checkpoint",
    );
    await database
      .update(agentWorkspaces)
      .set({ solariSnapshotId: snapshotId, lastActiveAt: new Date() })
      .where(eq(agentWorkspaces.id, workspace.id));
  } catch (error) {
    await releaseBillableOperation(reservation);
    throw error;
  }

  await settleBillableOperation(reservation, snapshotId);

  return loadSessionState(participantId);
}

export async function pauseParticipantWorkspace(
  participantId: string,
  context: WorkspaceOperationContext,
) {
  const database = getDatabase();
  await requireRuntimeLease(participantId, context.authorization);
  const state = await loadSessionState(participantId);
  const workspace = state.workspace;

  if (!workspace?.sessionId) {
    throw new Error("The agent workspace has no Desktop to pause.");
  }

  if (workspace.status === "paused") return state;

  const solari = context.adapters ?? (await createSolariAdapters());
  const snapshotId = await solari.desktop.checkpoint(
    workspace.sessionId,
    "sylla-before-pause",
  );
  await solari.desktop.pause(workspace.sessionId);
  const now = new Date();
  await database
    .update(agentWorkspaces)
    .set({
      solariSnapshotId: snapshotId,
      status: "paused",
      pausedAt: now,
      lastActiveAt: now,
    })
    .where(eq(agentWorkspaces.id, workspace.id));

  return loadSessionState(participantId);
}
