import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  agentRuns,
  runCheckpoints,
  runHandoffs,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import {
  createConfiguredInternalModelAdapter,
  createDeterministicInternalModelAdapter,
  type InternalHandoffOutput,
  type InternalModelAdapter,
} from "@/lib/sylla/internal-model";
import {
  acquireRuntimeLease,
  releaseRuntimeLease,
  requireRuntimeLease,
  RuntimeLeaseConflictError,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";

export const FALLBACK_TASK_TYPE = "prepare_reconnect_summary" as const;
export const FALLBACK_TASK_COST = 1;
const STALE_FALLBACK_MS = 5 * 60 * 1_000;

export type VisibleRunCheckpoint = {
  summary: string;
  completedActions: string[];
  nextAction: string | null;
  evidenceRefs: string[];
};

export type AgentRunView = {
  id: string;
  hostRunId: string;
  purpose: string;
  status:
    | "host_orchestrated"
    | "waiting_for_host"
    | "fallback_running"
    | "completed"
    | "canceled"
    | "failed";
  executionMode:
    | "host_orchestrated"
    | "deterministic_background"
    | "internal_fallback";
  backgroundContinuationAllowed: boolean;
  fallbackBudgetCredits: number;
  fallbackCreditsUsed: number;
  fallbackReason: string | null;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  fallbackError: string | null;
  latestCheckpoint: (VisibleRunCheckpoint & {
    id: string;
    sequence: number;
    kind: string;
    createdBy: AgentRunView["executionMode"];
    createdAt: string;
  }) | null;
  handoff: {
    id: string;
    reason: string;
    summary: string;
    fromMode: AgentRunView["executionMode"];
    toMode: AgentRunView["executionMode"];
    completedActions: string[];
    nextAction: string | null;
    fallbackCreditsUsed: number;
    consequentialActionsTaken: boolean;
    modelProvider: string;
    model: string | null;
    modelInputTokens: number | null;
    modelOutputTokens: number | null;
    deterministicRecoveryUsed: boolean;
    createdAt: string;
    acknowledgedAt: string | null;
  } | null;
};

export class AgentRunAuthorizationError extends Error {}
export class AgentRunIdempotencyError extends Error {}

async function loadOwnedRun(
  participantId: string,
  agentRunId: string,
): Promise<AgentRunView> {
  const database = getDatabase();
  const [run] = await database
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.id, agentRunId),
        eq(agentRuns.participantId, participantId),
      ),
    )
    .limit(1);

  if (!run) throw new AgentRunAuthorizationError("Agent run not found.");

  const [checkpoint] = await database
    .select()
    .from(runCheckpoints)
    .where(eq(runCheckpoints.agentRunId, run.id))
    .orderBy(desc(runCheckpoints.sequence))
    .limit(1);
  const [handoff] = await database
    .select()
    .from(runHandoffs)
    .where(eq(runHandoffs.agentRunId, run.id))
    .limit(1);

  return {
    id: run.id,
    hostRunId: run.hostRunId,
    purpose: run.purpose,
    status: run.status,
    executionMode: run.executionMode,
    backgroundContinuationAllowed: run.backgroundContinuationAllowed,
    fallbackBudgetCredits: run.fallbackBudgetCredits,
    fallbackCreditsUsed: run.fallbackCreditsUsed,
    fallbackReason: run.fallbackReason,
    fallbackProvider: run.fallbackProvider,
    fallbackModel: run.fallbackModel,
    fallbackError: run.fallbackError,
    latestCheckpoint: checkpoint
      ? {
          id: checkpoint.id,
          sequence: checkpoint.sequence,
          kind: checkpoint.kind,
          summary: checkpoint.summary,
          completedActions: checkpoint.resumableState.completedActions,
          nextAction: checkpoint.resumableState.nextAction,
          evidenceRefs: checkpoint.resumableState.evidenceRefs,
          createdBy: checkpoint.createdBy,
          createdAt: checkpoint.createdAt.toISOString(),
        }
      : null,
    handoff: handoff
      ? {
          id: handoff.id,
          reason: handoff.reason,
          summary: handoff.summary,
          fromMode: handoff.fromMode,
          toMode: handoff.toMode,
          completedActions: handoff.details.completedActions,
          nextAction: handoff.details.nextAction,
          fallbackCreditsUsed: handoff.details.fallbackCreditsUsed,
          consequentialActionsTaken:
            handoff.details.consequentialActionsTaken,
          modelProvider:
            handoff.details.modelProvider ?? "sylla-deterministic",
          model: handoff.details.model ?? null,
          modelInputTokens: handoff.details.modelInputTokens ?? null,
          modelOutputTokens: handoff.details.modelOutputTokens ?? null,
          deterministicRecoveryUsed:
            handoff.details.deterministicRecoveryUsed ?? true,
          createdAt: handoff.createdAt.toISOString(),
          acknowledgedAt: handoff.acknowledgedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function startAgentRun(input: {
  participantId: string;
  authorization: RuntimeLeaseAuthorization;
  idempotencyKey: string;
  purpose: string;
  backgroundContinuationAllowed: boolean;
  fallbackBudgetCredits: number;
}): Promise<AgentRunView> {
  const database = getDatabase();
  await requireRuntimeLease(input.participantId, input.authorization);
  const identity = await ensurePortableIdentity(input.participantId);
  const approvedBudget = input.backgroundContinuationAllowed
    ? Math.max(0, Math.round(input.fallbackBudgetCredits))
    : 0;

  const [created] = await database
    .insert(agentRuns)
    .values({
      userId: identity.userId,
      agentId: identity.agentId,
      participantId: input.participantId,
      hostRunId: input.authorization.runId,
      idempotencyKey: input.idempotencyKey,
      purpose: input.purpose,
      approvedTaskType: FALLBACK_TASK_TYPE,
      approvedScope: {
        allowedActions: ["create_reconnect_summary"],
        evidenceRefs: [],
      },
      backgroundContinuationAllowed: input.backgroundContinuationAllowed,
      fallbackBudgetCredits: approvedBudget,
      lastHostClientId: input.authorization.clientId,
    })
    .onConflictDoNothing({
      target: [agentRuns.participantId, agentRuns.idempotencyKey],
    })
    .returning({ id: agentRuns.id });

  if (created) return loadOwnedRun(input.participantId, created.id);

  const [existing] = await database
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.participantId, input.participantId),
        eq(agentRuns.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);

  if (
    !existing ||
    existing.hostRunId !== input.authorization.runId ||
    existing.purpose !== input.purpose ||
    existing.backgroundContinuationAllowed !==
      input.backgroundContinuationAllowed ||
    existing.fallbackBudgetCredits !== approvedBudget
  ) {
    throw new AgentRunIdempotencyError(
      "The idempotency key belongs to a different agent-run request.",
    );
  }

  return loadOwnedRun(input.participantId, existing.id);
}

export async function checkpointAgentRun(input: {
  participantId: string;
  agentRunId: string;
  authorization: RuntimeLeaseAuthorization;
  checkpoint: VisibleRunCheckpoint;
}): Promise<AgentRunView> {
  const database = getDatabase();
  await requireRuntimeLease(input.participantId, input.authorization);

  const inserted = await database.execute<{ checkpoint_id: string }>(sql`
    with advanced_run as (
      update agent_runs
      set checkpoint_sequence = checkpoint_sequence + 1,
          updated_at = now()
      where id = ${input.agentRunId}
        and participant_id = ${input.participantId}
        and host_run_id = ${input.authorization.runId}
        and last_host_client_id = ${input.authorization.clientId}
        and status = 'host_orchestrated'
      returning id, checkpoint_sequence
    )
    insert into run_checkpoints (
      agent_run_id,
      sequence,
      kind,
      summary,
      resumable_state,
      created_by
    )
    select
      id,
      checkpoint_sequence,
      'host_checkpoint',
      ${input.checkpoint.summary},
      ${JSON.stringify({
        completedActions: input.checkpoint.completedActions,
        nextAction: input.checkpoint.nextAction,
        evidenceRefs: input.checkpoint.evidenceRefs,
      })}::jsonb,
      'host_orchestrated'
    from advanced_run
    returning id as checkpoint_id
  `);

  if (!inserted.rows[0]) {
    throw new AgentRunAuthorizationError(
      "The active host lease does not own this runnable agent run.",
    );
  }

  return loadOwnedRun(input.participantId, input.agentRunId);
}

export async function yieldAgentRunToBackground(input: {
  participantId: string;
  agentRunId: string;
  authorization: RuntimeLeaseAuthorization;
}): Promise<AgentRunView> {
  const database = getDatabase();
  await requireRuntimeLease(input.participantId, input.authorization);
  const [run] = await database
    .update(agentRuns)
    .set({ status: "waiting_for_host", updatedAt: new Date() })
    .where(
      and(
        eq(agentRuns.id, input.agentRunId),
        eq(agentRuns.participantId, input.participantId),
        eq(agentRuns.hostRunId, input.authorization.runId),
        eq(agentRuns.lastHostClientId, input.authorization.clientId),
        eq(agentRuns.status, "host_orchestrated"),
      ),
    )
    .returning({ id: agentRuns.id });

  if (!run) {
    throw new AgentRunAuthorizationError(
      "The active host lease does not own this runnable agent run.",
    );
  }

  await releaseRuntimeLease(input.participantId, input.authorization);
  return loadOwnedRun(input.participantId, input.agentRunId);
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "Unknown internal fallback error.";
}

async function claimFallbackRun(input: {
  participantId: string;
  agentRunId: string;
  authorization: RuntimeLeaseAuthorization;
  adapter: InternalModelAdapter;
}) {
  const database = getDatabase();
  const staleBefore = new Date(Date.now() - STALE_FALLBACK_MS);
  const claimed = await database.execute<{ recovered: boolean }>(sql`
    with candidate as (
      select id, status
      from agent_runs
      where id = ${input.agentRunId}
        and participant_id = ${input.participantId}
        and approved_task_type = ${FALLBACK_TASK_TYPE}
        and approved_scope @>
          '{"allowedActions":["create_reconnect_summary"]}'::jsonb
        and background_continuation_allowed = true
        and not exists (
          select 1
          from run_handoffs
          where run_handoffs.agent_run_id = agent_runs.id
        )
        and (
          (
            status in ('host_orchestrated', 'waiting_for_host')
            and fallback_credits_used + ${FALLBACK_TASK_COST}
              <= fallback_budget_credits
          )
          or (
            status = 'fallback_running'
            and fallback_claimed_at <= ${staleBefore}
          )
        )
      for update
    )
    update agent_runs as run
    set status = 'fallback_running',
        execution_mode = 'internal_fallback',
        fallback_credits_used = case
          when candidate.status = 'fallback_running'
            then run.fallback_credits_used
          else run.fallback_credits_used + ${FALLBACK_TASK_COST}
        end,
        checkpoint_sequence = case
          when candidate.status = 'fallback_running'
            then run.checkpoint_sequence
          else run.checkpoint_sequence + 1
        end,
        fallback_reason = 'host_lease_unavailable',
        fallback_worker_run_id = ${input.authorization.runId},
        fallback_provider = ${input.adapter.provider},
        fallback_model = ${input.adapter.model},
        fallback_error = case
          when candidate.status = 'fallback_running'
            then 'Recovered a stale fallback worker after its lease expired.'
          else null
        end,
        fallback_claimed_at = now(),
        updated_at = now()
    from candidate
    where run.id = candidate.id
    returning candidate.status = 'fallback_running' as recovered
  `);

  return claimed.rows[0] ?? null;
}

async function completeFallbackRun(input: {
  participantId: string;
  agentRunId: string;
  authorization: RuntimeLeaseAuthorization;
  checkpoint: VisibleRunCheckpoint | null;
  output: InternalHandoffOutput;
  modelError: string | null;
}) {
  const database = getDatabase();
  await requireRuntimeLease(input.participantId, input.authorization);
  const resumableState = {
    completedActions: input.checkpoint?.completedActions ?? [],
    nextAction: input.output.nextAction,
    evidenceRefs: input.checkpoint?.evidenceRefs ?? [],
  };
  const completed = await database.execute<{ handoff_id: string }>(sql`
    with owned_run as (
      select id, checkpoint_sequence, fallback_credits_used
      from agent_runs
      where id = ${input.agentRunId}
        and participant_id = ${input.participantId}
        and status = 'fallback_running'
        and fallback_worker_run_id = ${input.authorization.runId}
    ), fallback_checkpoint as (
      insert into run_checkpoints (
        agent_run_id,
        sequence,
        kind,
        summary,
        resumable_state,
        created_by
      )
      select
        id,
        checkpoint_sequence,
        'fallback_handoff',
        ${input.output.summary},
        ${JSON.stringify(resumableState)}::jsonb,
        'internal_fallback'
      from owned_run
      returning id, agent_run_id, summary, resumable_state
    ), created_handoff as (
      insert into run_handoffs (
        agent_run_id,
        checkpoint_id,
        from_mode,
        to_mode,
        reason,
        summary,
        details,
        claimed_by
      )
      select
        fallback_checkpoint.agent_run_id,
        fallback_checkpoint.id,
        'host_orchestrated',
        'internal_fallback',
        'host_lease_unavailable',
        fallback_checkpoint.summary,
        jsonb_build_object(
          'completedActions',
            fallback_checkpoint.resumable_state->'completedActions',
          'nextAction', fallback_checkpoint.resumable_state->'nextAction',
          'fallbackCreditsUsed', owned_run.fallback_credits_used,
          'consequentialActionsTaken', false,
          'modelProvider', ${input.output.provider}::text,
          'model', ${input.output.model}::text,
          'modelInputTokens', ${input.output.inputTokens}::integer,
          'modelOutputTokens', ${input.output.outputTokens}::integer,
          'deterministicRecoveryUsed',
            ${input.output.deterministicRecoveryUsed}::boolean
        ),
        ${input.authorization.runId}
      from fallback_checkpoint
      join owned_run on owned_run.id = fallback_checkpoint.agent_run_id
      returning id, agent_run_id
    ), completed_run as (
      update agent_runs as run
      set status = 'completed',
          fallback_error = ${input.modelError},
          completed_at = now(),
          updated_at = now()
      from created_handoff
      where run.id = created_handoff.agent_run_id
      returning created_handoff.id as handoff_id
    )
    select handoff_id from completed_run
  `);

  if (!completed.rows[0]) {
    throw new AgentRunAuthorizationError(
      "The fallback worker no longer owns this agent run.",
    );
  }
}

async function processFallbackRun(input: {
  participantId: string;
  agentRunId: string;
  workerId?: string;
  adapter: InternalModelAdapter;
}): Promise<{ executed: boolean; run: AgentRunView }> {
  const workerRunId = `fallback:${input.agentRunId}:${randomUUID()}`;
  let authorization: RuntimeLeaseAuthorization;
  try {
    authorization = await acquireRuntimeLease({
      participantId: input.participantId,
      clientId: input.workerId ?? "sylla-fallback-controller",
      runId: workerRunId,
      purpose: "Bounded internal fallback",
      durationSeconds: 90,
    });
  } catch (error) {
    if (error instanceof RuntimeLeaseConflictError) {
      return {
        executed: false,
        run: await loadOwnedRun(input.participantId, input.agentRunId),
      };
    }
    throw error;
  }

  try {
    const claim = await claimFallbackRun({
      participantId: input.participantId,
      agentRunId: input.agentRunId,
      authorization,
      adapter: input.adapter,
    });
    if (!claim) {
      return {
        executed: false,
        run: await loadOwnedRun(input.participantId, input.agentRunId),
      };
    }

    const claimedRun = await loadOwnedRun(
      input.participantId,
      input.agentRunId,
    );
    let output: InternalHandoffOutput;
    let modelError = claimedRun.fallbackError;
    if (claim.recovered) {
      output = await createDeterministicInternalModelAdapter().generateReconnectHandoff(
        { purpose: claimedRun.purpose, checkpoint: claimedRun.latestCheckpoint },
      );
    } else {
      try {
        output = await input.adapter.generateReconnectHandoff({
          purpose: claimedRun.purpose,
          checkpoint: claimedRun.latestCheckpoint,
        });
      } catch (error) {
        modelError = safeErrorMessage(error);
        output = await createDeterministicInternalModelAdapter().generateReconnectHandoff(
          { purpose: claimedRun.purpose, checkpoint: claimedRun.latestCheckpoint },
        );
      }
    }

    await completeFallbackRun({
      participantId: input.participantId,
      agentRunId: input.agentRunId,
      authorization,
      checkpoint: claimedRun.latestCheckpoint,
      output,
      modelError,
    });
    return {
      executed: true,
      run: await loadOwnedRun(input.participantId, input.agentRunId),
    };
  } finally {
    await releaseRuntimeLease(input.participantId, authorization).catch(
      () => undefined,
    );
  }
}

export async function executeFallbackOnce(input: {
  participantId: string;
  agentRunId: string;
  workerId?: string;
}): Promise<{ executed: boolean; run: AgentRunView }> {
  return processFallbackRun({
    ...input,
    adapter: createDeterministicInternalModelAdapter(),
  });
}

export type FallbackSweepResult = {
  examined: number;
  executed: number;
  skipped: number;
  failed: number;
  failures: Array<{ agentRunId: string; error: string }>;
};

export async function sweepFallbackRuns(input: {
  limit?: number;
  workerId?: string;
  adapter?: InternalModelAdapter;
} = {}): Promise<FallbackSweepResult> {
  const database = getDatabase();
  const limit = Math.min(20, Math.max(1, Math.round(input.limit ?? 10)));
  const staleBefore = new Date(Date.now() - STALE_FALLBACK_MS);
  const adapter = input.adapter ?? createConfiguredInternalModelAdapter();
  const candidates = await database.execute<{
    agent_run_id: string;
    participant_id: string;
  }>(sql`
    select id as agent_run_id, participant_id
    from agent_runs
    where approved_task_type = ${FALLBACK_TASK_TYPE}
      and approved_scope @>
        '{"allowedActions":["create_reconnect_summary"]}'::jsonb
      and background_continuation_allowed = true
      and not exists (
        select 1 from run_handoffs
        where run_handoffs.agent_run_id = agent_runs.id
      )
      and (
        (
          status in ('host_orchestrated', 'waiting_for_host')
          and fallback_credits_used + ${FALLBACK_TASK_COST}
            <= fallback_budget_credits
        )
        or (
          status = 'fallback_running'
          and fallback_claimed_at <= ${staleBefore}
        )
      )
    order by created_at asc
    limit ${limit}
  `);
  const result: FallbackSweepResult = {
    examined: candidates.rows.length,
    executed: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  for (const candidate of candidates.rows) {
    try {
      const processed = await processFallbackRun({
        participantId: candidate.participant_id,
        agentRunId: candidate.agent_run_id,
        workerId: input.workerId,
        adapter,
      });
      if (processed.executed) result.executed += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      result.failures.push({
        agentRunId: candidate.agent_run_id,
        error: safeErrorMessage(error),
      });
    }
  }

  return result;
}

export async function getAgentRun(
  participantId: string,
  agentRunId: string,
) {
  return loadOwnedRun(participantId, agentRunId);
}

export async function acknowledgeAgentRunHandoff(input: {
  participantId: string;
  agentRunId: string;
  authorization: RuntimeLeaseAuthorization;
}) {
  const database = getDatabase();
  await requireRuntimeLease(input.participantId, input.authorization);
  const acknowledged = await database.execute<{ handoff_id: string }>(sql`
    update run_handoffs as handoff
    set acknowledged_at = coalesce(acknowledged_at, now())
    from agent_runs as run
    where handoff.agent_run_id = run.id
      and run.id = ${input.agentRunId}
      and run.participant_id = ${input.participantId}
    returning handoff.id as handoff_id
  `);

  if (!acknowledged.rows[0]) {
    throw new AgentRunAuthorizationError(
      "This agent run has no fallback handoff to acknowledge.",
    );
  }

  return loadOwnedRun(input.participantId, input.agentRunId);
}
