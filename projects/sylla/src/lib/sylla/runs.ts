import { and, desc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  agentRuns,
  runCheckpoints,
  runHandoffs,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import {
  releaseRuntimeLease,
  requireRuntimeLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";

export const FALLBACK_TASK_TYPE = "prepare_reconnect_summary" as const;
export const FALLBACK_TASK_COST = 1;

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

export async function executeFallbackOnce(input: {
  participantId: string;
  agentRunId: string;
  workerId?: string;
}): Promise<{ executed: boolean; run: AgentRunView }> {
  const database = getDatabase();
  const workerId = input.workerId ?? "sylla-fallback-controller";
  const fallbackReason = "host_lease_unavailable";
  const fallbackSummary =
    "Sylla preserved the latest explicit checkpoint after the host lease ended. No consequential action was taken; reconnect to review or continue.";

  const claimed = await database.execute<{ handoff_id: string }>(sql`
    with claimed_run as (
      update agent_runs as run
      set status = 'completed',
          execution_mode = 'internal_fallback',
          fallback_credits_used = fallback_credits_used + ${FALLBACK_TASK_COST},
          checkpoint_sequence = checkpoint_sequence + 1,
          fallback_reason = ${fallbackReason},
          fallback_claimed_at = now(),
          completed_at = now(),
          updated_at = now()
      where run.id = ${input.agentRunId}
        and run.participant_id = ${input.participantId}
        and run.approved_task_type = ${FALLBACK_TASK_TYPE}
        and run.approved_scope @>
          '{"allowedActions":["create_reconnect_summary"]}'::jsonb
        and run.background_continuation_allowed = true
        and run.fallback_credits_used + ${FALLBACK_TASK_COST}
          <= run.fallback_budget_credits
        and run.status in ('host_orchestrated', 'waiting_for_host')
        and not exists (
          select 1
          from runtime_leases as lease
          where lease.agent_id = run.agent_id
            and lease.released_at is null
            and lease.expires_at > now()
        )
        and not exists (
          select 1
          from run_handoffs as prior_handoff
          where prior_handoff.agent_run_id = run.id
        )
      returning
        run.id,
        run.checkpoint_sequence,
        run.fallback_credits_used
    ), latest_host_checkpoint as (
      select
        claimed_run.id as agent_run_id,
        claimed_run.checkpoint_sequence,
        claimed_run.fallback_credits_used,
        checkpoint.resumable_state
      from claimed_run
      left join lateral (
        select resumable_state
        from run_checkpoints
        where run_checkpoints.agent_run_id = claimed_run.id
        order by sequence desc
        limit 1
      ) as checkpoint on true
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
        agent_run_id,
        checkpoint_sequence,
        'fallback_handoff',
        ${fallbackSummary},
        coalesce(
          resumable_state,
          jsonb_build_object(
            'completedActions', '[]'::jsonb,
            'nextAction', null,
            'evidenceRefs', '[]'::jsonb
          )
        ),
        'internal_fallback'
      from latest_host_checkpoint
      returning id, agent_run_id, summary, resumable_state
    )
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
      ${fallbackReason},
      fallback_checkpoint.summary,
      jsonb_build_object(
        'completedActions',
          coalesce(fallback_checkpoint.resumable_state->'completedActions', '[]'::jsonb),
        'nextAction', fallback_checkpoint.resumable_state->'nextAction',
        'fallbackCreditsUsed', latest_host_checkpoint.fallback_credits_used,
        'consequentialActionsTaken', false
      ),
      ${workerId}
    from fallback_checkpoint
    join latest_host_checkpoint
      on latest_host_checkpoint.agent_run_id = fallback_checkpoint.agent_run_id
    returning id as handoff_id
  `);

  return {
    executed: Boolean(claimed.rows[0]),
    run: await loadOwnedRun(input.participantId, input.agentRunId),
  };
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
