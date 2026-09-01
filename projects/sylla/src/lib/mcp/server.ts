import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { SyllaSessionState } from "@/lib/sylla/contracts";
import {
  EntitlementRequiredError,
  getBillingSummary,
  OPERATION_CREDITS,
  type BillingSummary,
} from "@/lib/sylla/billing";
import { updatePortableAgent } from "@/lib/sylla/identity";
import {
  acquireRuntimeLease,
  heartbeatRuntimeLease,
  releaseRuntimeLease,
  type AcquiredRuntimeLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import {
  acknowledgeAgentRunHandoff,
  checkpointAgentRun,
  executeFallbackOnce,
  getAgentRun,
  startAgentRun,
  type AgentRunView,
  type VisibleRunCheckpoint,
  yieldAgentRunToBackground,
} from "@/lib/sylla/runs";
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
  getBilling: (participantId: string) => Promise<BillingSummary>;
  acquireLease: (input: {
    participantId: string;
    clientId: string;
    runId: string;
    purpose: string;
    durationSeconds?: number;
  }) => Promise<AcquiredRuntimeLease>;
  heartbeatLease: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
    durationSeconds?: number,
  ) => Promise<{ leaseId: string; expiresAt: string }>;
  releaseLease: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
  ) => Promise<void>;
  startRun: (input: {
    participantId: string;
    authorization: RuntimeLeaseAuthorization;
    idempotencyKey: string;
    purpose: string;
    backgroundContinuationAllowed: boolean;
    fallbackBudgetCredits: number;
  }) => Promise<AgentRunView>;
  checkpointRun: (input: {
    participantId: string;
    agentRunId: string;
    authorization: RuntimeLeaseAuthorization;
    checkpoint: VisibleRunCheckpoint;
  }) => Promise<AgentRunView>;
  yieldRun: (input: {
    participantId: string;
    agentRunId: string;
    authorization: RuntimeLeaseAuthorization;
  }) => Promise<AgentRunView>;
  executeFallback: (input: {
    participantId: string;
    agentRunId: string;
  }) => Promise<{ executed: boolean; run: AgentRunView }>;
  getRun: (participantId: string, agentRunId: string) => Promise<AgentRunView>;
  acknowledgeHandoff: (input: {
    participantId: string;
    agentRunId: string;
    authorization: RuntimeLeaseAuthorization;
  }) => Promise<AgentRunView>;
  openWorkspace: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
    idempotencyKey: string,
  ) => Promise<SyllaSessionState>;
  checkpointWorkspace: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
    idempotencyKey: string,
  ) => Promise<SyllaSessionState>;
  pauseWorkspace: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
    idempotencyKey: string,
  ) => Promise<SyllaSessionState>;
};

const defaultServices: SyllaMcpServices = {
  async bootstrapAgent(participantId, input) {
    await updatePortableAgent(participantId, input);
    return loadSessionState(participantId);
  },
  loadState: loadSessionState,
  getBilling: getBillingSummary,
  acquireLease: acquireRuntimeLease,
  heartbeatLease: heartbeatRuntimeLease,
  releaseLease: releaseRuntimeLease,
  startRun: startAgentRun,
  checkpointRun: checkpointAgentRun,
  yieldRun: yieldAgentRunToBackground,
  executeFallback: executeFallbackOnce,
  getRun: getAgentRun,
  acknowledgeHandoff: acknowledgeAgentRunHandoff,
  async openWorkspace(participantId, authorization, idempotencyKey) {
    return (
      await openParticipantWorkspace(participantId, {
        authorization,
        idempotencyKey,
      })
    ).state;
  },
  checkpointWorkspace(participantId, authorization, idempotencyKey) {
    return checkpointParticipantWorkspace(participantId, {
      authorization,
      idempotencyKey,
    });
  },
  pauseWorkspace(participantId, authorization, idempotencyKey) {
    return pauseParticipantWorkspace(participantId, {
      authorization,
      idempotencyKey,
    });
  },
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

const runIdSchema = z.string().trim().min(8).max(120);
const leaseTokenSchema = z.string().trim().min(32).max(200);
const idempotencyKeySchema = z.string().trim().min(8).max(160);
const agentRunIdSchema = z.uuid();
const checkpointSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  completedActions: z.array(z.string().trim().min(1).max(160)).max(20),
  nextAction: z.string().trim().min(1).max(240).nullable(),
  evidenceRefs: z.array(z.string().trim().min(1).max(240)).max(20),
});

function leaseAuthorization(
  clientId: string,
  input: { runId: string; leaseToken: string },
): RuntimeLeaseAuthorization {
  return { clientId, runId: input.runId, leaseToken: input.leaseToken };
}

function entitlementContinuation(error: EntitlementRequiredError) {
  return result({
    allowed: false,
    reason: "insufficient_entitlement",
    plan: error.summary,
    checkout: {
      url: error.checkoutUrl,
      hosted: true,
      acceptsPaymentDataInMcp: false,
    },
  });
}

export function createSyllaMcpServer(
  context: { participantId: string; clientId: string },
  services: SyllaMcpServices = defaultServices,
) {
  const { participantId, clientId } = context;
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
    "sylla_get_plan",
    {
      title: "Check my Sylla plan and work credits",
      description:
        "Return the caller's Sylla entitlement, available work credits, and current operation estimates. Work credits cover Sylla-managed runtime; they are separate from the host LLM subscription.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      result({
        plan: await services.getBilling(participantId),
        operationEstimates: OPERATION_CREDITS,
        paymentBoundary:
          "Payment credentials are accepted only by Sylla's hosted checkout, never through MCP.",
      }),
  );

  server.registerTool(
    "sylla_acquire_agent_lease",
    {
      title: "Acquire my Sylla agent run",
      description:
        "Acquire the exclusive short-lived orchestration lease before operating the agent's Desktop. Use a unique runId for this host conversation. Another run cannot operate the same agent until the lease is released or expires.",
      inputSchema: z.object({
        runId: runIdSchema,
        purpose: z.string().trim().min(3).max(160),
        durationSeconds: z.number().int().min(30).max(300).default(90),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ runId, purpose, durationSeconds }) => {
      const lease = await services.acquireLease({
        participantId,
        clientId,
        runId,
        purpose,
        durationSeconds,
      });
      return result({
        lease: {
          runId: lease.runId,
          leaseToken: lease.leaseToken,
          expiresAt: lease.expiresAt,
          heartbeatRequired: true,
        },
      });
    },
  );

  server.registerTool(
    "sylla_heartbeat_agent_lease",
    {
      title: "Keep my Sylla agent run active",
      description:
        "Renew the current run's exclusive lease while the host is actively orchestrating work.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        durationSeconds: z.number().int().min(30).max(300).default(90),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ runId, leaseToken, durationSeconds }) =>
      result({
        lease: await services.heartbeatLease(
          participantId,
          leaseAuthorization(clientId, { runId, leaseToken }),
          durationSeconds,
        ),
      }),
  );

  server.registerTool(
    "sylla_release_agent_lease",
    {
      title: "Release my Sylla agent run",
      description:
        "Release the current run's exclusive orchestration lease when work stops or transfers. This does not delete the agent or its persistent home.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ runId, leaseToken }) => {
      await services.releaseLease(
        participantId,
        leaseAuthorization(clientId, { runId, leaseToken }),
      );
      return result({ released: true });
    },
  );

  server.registerTool(
    "sylla_start_agent_run",
    {
      title: "Start durable Sylla work",
      description:
        "Create an idempotent durable run under the active host lease. The run stores only explicit resumable state, never hidden reasoning or an unreviewed private debrief. Background continuation is optional and limited to creating a reconnect summary in this version.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
        purpose: z.string().trim().min(3).max(240),
        backgroundContinuationAllowed: z.boolean().default(false),
        fallbackBudgetCredits: z.number().int().min(0).max(25).default(0),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({
      runId,
      leaseToken,
      idempotencyKey,
      purpose,
      backgroundContinuationAllowed,
      fallbackBudgetCredits,
    }) =>
      result({
        run: await services.startRun({
          participantId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          idempotencyKey,
          purpose,
          backgroundContinuationAllowed,
          fallbackBudgetCredits,
        }),
        fallbackPolicy: {
          approvedTaskType: "prepare_reconnect_summary",
          consequentialActionsAllowed: false,
          rawDebriefStored: false,
        },
      }),
  );

  server.registerTool(
    "sylla_checkpoint_agent_run",
    {
      title: "Checkpoint durable Sylla work",
      description:
        "Persist a concise, participant-visible checkpoint for the current run. Include completed actions, the next action, and opaque evidence references; do not send chain of thought, credentials, or raw private debrief text.",
      inputSchema: z.object({
        agentRunId: agentRunIdSchema,
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        checkpoint: checkpointSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ agentRunId, runId, leaseToken, checkpoint }) =>
      result({
        run: await services.checkpointRun({
          participantId,
          agentRunId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          checkpoint,
        }),
      }),
  );

  server.registerTool(
    "sylla_yield_agent_run",
    {
      title: "Yield Sylla work for safe continuation",
      description:
        "Mark the durable run as waiting and release the host lease. If the participant enabled bounded continuation, the Sylla controller may perform only the approved reconnect-summary task after the lease is gone.",
      inputSchema: z.object({
        agentRunId: agentRunIdSchema,
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ agentRunId, runId, leaseToken }) =>
      result({
        run: await services.yieldRun({
          participantId,
          agentRunId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
        }),
        leaseReleased: true,
      }),
  );

  server.registerTool(
    "sylla_attempt_agent_fallback",
    {
      title: "Attempt bounded Sylla fallback",
      description:
        "Ask Sylla's deterministic controller to claim the approved fallback task. It does nothing while a host lease is active, cannot exceed the run budget, cannot take consequential action, and can succeed only once.",
      inputSchema: z.object({ agentRunId: agentRunIdSchema }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentRunId }) =>
      result(
        await services.executeFallback({ participantId, agentRunId }),
      ),
  );

  server.registerTool(
    "sylla_get_agent_run",
    {
      title: "Read Sylla run and reconnect handoff",
      description:
        "Read the durable status, latest explicit checkpoint, and any auditable fallback handoff for this caller's agent run.",
      inputSchema: z.object({ agentRunId: agentRunIdSchema }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentRunId }) =>
      result({ run: await services.getRun(participantId, agentRunId) }),
  );

  server.registerTool(
    "sylla_acknowledge_agent_handoff",
    {
      title: "Acknowledge a Sylla reconnect handoff",
      description:
        "After acquiring a new host lease, acknowledge that the reconnecting host received the durable fallback summary. This never repeats the completed fallback task.",
      inputSchema: z.object({
        agentRunId: agentRunIdSchema,
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentRunId, runId, leaseToken }) =>
      result({
        run: await services.acknowledgeHandoff({
          participantId,
          agentRunId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
        }),
      }),
  );

  server.registerTool(
    "sylla_open_agent_workspace",
    {
      title: "Open my Sylla agent home",
      description:
        "Create or resume the caller's persistent private Solari Desktop, attach its durable volume, materialize only approved memories, and checkpoint the result. This may consume Sylla runtime allowance and never returns a stream capability or provider credential.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ runId, leaseToken, idempotencyKey }) => {
      let state: SyllaSessionState;
      try {
        state = await services.openWorkspace(
          participantId,
          leaseAuthorization(clientId, { runId, leaseToken }),
          idempotencyKey,
        );
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
      return result({
        allowed: true,
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
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ runId, leaseToken, idempotencyKey }) => {
      let state: SyllaSessionState;
      try {
        state = await services.checkpointWorkspace(
          participantId,
          leaseAuthorization(clientId, { runId, leaseToken }),
          idempotencyKey,
        );
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
      return result({
        allowed: true,
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
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ runId, leaseToken, idempotencyKey }) => {
      let state: SyllaSessionState;
      try {
        state = await services.pauseWorkspace(
          participantId,
          leaseAuthorization(clientId, { runId, leaseToken }),
          idempotencyKey,
        );
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
      return result({
        allowed: true,
        workspaceStatus: state.workspace?.status ?? "unprovisioned",
        preserved: Boolean(state.workspace?.volumeId),
        hasRecoverySnapshot: Boolean(state.workspace?.snapshotId),
      });
    },
  );

  return server;
}
