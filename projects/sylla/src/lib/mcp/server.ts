import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { SyllaSessionState } from "@/lib/sylla/contracts";
import { updatePortableAgent } from "@/lib/sylla/identity";
import { loadSessionState } from "@/lib/sylla/session";
import {
  checkpointParticipantWorkspace,
  openParticipantWorkspace,
  pauseParticipantWorkspace,
} from "@/lib/sylla/workspace";

type BootstrapInput = {
  agentName?: string;
  focus?: string;
};

export type SyllaMcpServices = {
  bootstrapAgent: (
    participantId: string,
    input: BootstrapInput,
  ) => Promise<SyllaSessionState>;
  loadState: (participantId: string) => Promise<SyllaSessionState>;
  openWorkspace: (participantId: string) => Promise<SyllaSessionState>;
  checkpointWorkspace: (participantId: string) => Promise<SyllaSessionState>;
  pauseWorkspace: (participantId: string) => Promise<SyllaSessionState>;
};

const defaultServices: SyllaMcpServices = {
  async bootstrapAgent(participantId, input) {
    await updatePortableAgent(participantId, input);
    return loadSessionState(participantId);
  },
  loadState: loadSessionState,
  async openWorkspace(participantId) {
    return (await openParticipantWorkspace(participantId)).state;
  },
  checkpointWorkspace: checkpointParticipantWorkspace,
  pauseWorkspace: pauseParticipantWorkspace,
};

function result<T extends Record<string, unknown>>(value: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function portableAgent(state: SyllaSessionState) {
  return {
    userId: state.identity.userId,
    agentId: state.identity.agentId,
    name: state.agentName,
    focus: state.focus,
    stage: state.stage,
    portable: true as const,
    workspaceStatus: state.workspace?.status ?? "unprovisioned",
    needsNaming: !state.agentName,
  };
}

export function createSyllaMcpServer(
  participantId: string,
  services: SyllaMcpServices = defaultServices,
) {
  const server = new McpServer({ name: "sylla", version: "0.1.0" });

  server.registerTool(
    "sylla_bootstrap_agent",
    {
      title: "Open my Sylla agent",
      description:
        "Idempotently create or recover the caller's portable Sylla agent. Use this at the beginning of a Sylla-enabled conversation. A name and current focus are optional; never invent either for the user.",
      inputSchema: z.object({
        agentName: z.string().trim().min(1).max(40).optional(),
        focus: z.string().trim().min(3).max(280).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const state = await services.bootstrapAgent(participantId, input);
      return result({ agent: portableAgent(state) });
    },
  );

  server.registerTool(
    "sylla_get_agent_context",
    {
      title: "Recall my approved Sylla context",
      description:
        "Return the caller's approved portable memories and optionally pending proposals. Pending proposals are not memories and must never be treated as approved.",
      inputSchema: z.object({
        includePending: z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ includePending }) => {
      const state = await services.loadState(participantId);
      const observations = state.observations.filter(
        (observation) => includePending || observation.status !== "pending",
      );

      return result({
        agent: portableAgent(state),
        memories: observations,
        memoryPolicy: {
          pendingIsApproved: false,
          approvalRequired: true,
          sourceCount: state.sources.length,
        },
      });
    },
  );

  server.registerTool(
    "sylla_get_agent_workspace",
    {
      title: "Inspect my Sylla workspace",
      description:
        "Return lifecycle metadata for the caller's persistent private agent home. This never exposes Solari stream capabilities or provider credentials.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const state = await services.loadState(participantId);
      return result({
        agentId: state.identity.agentId,
        workspace: state.workspace
          ? {
              id: state.workspace.id,
              status: state.workspace.status,
              provider: state.workspace.provider,
              hasDesktop: Boolean(state.workspace.sessionId),
              hasDurableVolume: Boolean(state.workspace.volumeId),
              hasRecoverySnapshot: Boolean(state.workspace.snapshotId),
              lastActiveAt: state.workspace.lastActiveAt,
              pausedAt: state.workspace.pausedAt,
            }
          : null,
      });
    },
  );

  server.registerTool(
    "sylla_open_agent_workspace",
    {
      title: "Open my Sylla agent home",
      description:
        "Create or resume the caller's persistent private Solari Desktop, attach its durable volume, materialize only approved memories, and checkpoint the result. This may consume Sylla runtime allowance and never returns a stream capability or provider credential.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async () => {
      const state = await services.openWorkspace(participantId);
      return result({
        agent: portableAgent(state),
        workspace: state.workspace
          ? {
              id: state.workspace.id,
              status: state.workspace.status,
              hasDesktop: Boolean(state.workspace.sessionId),
              hasDurableVolume: Boolean(state.workspace.volumeId),
              hasRecoverySnapshot: Boolean(state.workspace.snapshotId),
            }
          : null,
        viewerPolicy:
          "Open Sylla's participant-authorized web workspace to view the live Desktop.",
      });
    },
  );

  server.registerTool(
    "sylla_checkpoint_agent_workspace",
    {
      title: "Checkpoint my Sylla agent home",
      description:
        "Create a recovery checkpoint of the caller's open private Desktop without exposing its files or stream capability.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async () => {
      const state = await services.checkpointWorkspace(participantId);
      return result({
        workspaceStatus: state.workspace?.status ?? "unprovisioned",
        checkpointCreated: Boolean(state.workspace?.snapshotId),
      });
    },
  );

  server.registerTool(
    "sylla_pause_agent_workspace",
    {
      title: "Pause my Sylla agent home",
      description:
        "Checkpoint and pause the caller's Desktop to stop active compute while preserving its durable home for a later host or native Sylla app.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const state = await services.pauseWorkspace(participantId);
      return result({
        workspaceStatus: state.workspace?.status ?? "unprovisioned",
        preserved: Boolean(state.workspace?.volumeId),
        hasRecoverySnapshot: Boolean(state.workspace?.snapshotId),
      });
    },
  );

  return server;
}
