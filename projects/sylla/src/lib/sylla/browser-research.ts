import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  agentRuns,
  approvedSources,
  observations,
  participants,
  runHandoffs,
} from "@/db/schema";
import type {
  BrowserResearchAdapter,
  Evidence,
} from "@/lib/solari/contracts";
import { createSolariAdapters } from "@/lib/solari/factory";
import { assertPublicHttpUrl } from "@/lib/solari/url-policy";
import {
  releaseBillableOperation,
  reserveBillableOperation,
  settleBillableOperation,
} from "@/lib/sylla/billing";
import { updatePortableAgent } from "@/lib/sylla/identity";
import {
  acquireRuntimeLease,
  releaseRuntimeLease,
  requireRuntimeLease,
  RuntimeLeaseConflictError,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import { synthesizeObservationDrafts } from "@/lib/sylla/research";
import { requireParticipationCapability } from "@/lib/sylla/participation";
import {
  BROWSER_RESEARCH_TASK_TYPE,
  checkpointAgentRun,
  claimAgentRunForFallback,
  completeAgentRunFallback,
  completeHostAgentRun,
  getAgentRun,
  setAgentRunEvidenceScope,
  startAgentRun,
  type AgentRunView,
  type FallbackSweepResult,
} from "@/lib/sylla/runs";

const BROWSER_SOURCE_FALLBACK_COST = 1;
const STALE_BROWSER_FALLBACK_MS = 5 * 60 * 1_000;

export type BrowserResearchSourceInput = {
  url: string;
  label?: string;
};

export type BrowserResearchSourceView = {
  id: string;
  url: string;
  label: string | null;
  title: string | null;
  excerpt: string | null;
  status: string;
};

export type BrowserResearchProgress = {
  run: AgentRunView;
  sources: BrowserResearchSourceView[];
  completedCount: number;
  totalCount: number;
  nextSourceId: string | null;
  ambiguousSourceIds: string[];
};

export class BrowserResearchScopeError extends Error {}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "Unknown Solari Browser research error.";
}

function normalizeSources(sources: BrowserResearchSourceInput[]) {
  if (sources.length < 1 || sources.length > 3) {
    throw new BrowserResearchScopeError(
      "Approve between one and three Browser research sources.",
    );
  }

  const normalized = sources.map((source) => {
    const url = assertPublicHttpUrl(source.url).toString();
    const label = source.label?.trim().slice(0, 120);
    return { url, label: label || new URL(url).hostname };
  });
  if (new Set(normalized.map((source) => source.url)).size !== normalized.length) {
    throw new BrowserResearchScopeError(
      "Each approved Browser research source must be unique.",
    );
  }
  return normalized;
}

async function loadProgress(
  participantId: string,
  agentRunId: string,
): Promise<BrowserResearchProgress> {
  const database = getDatabase();
  const [row] = await database
    .select({ scope: agentRuns.approvedScope })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.id, agentRunId),
        eq(agentRuns.participantId, participantId),
        eq(agentRuns.approvedTaskType, BROWSER_RESEARCH_TASK_TYPE),
      ),
    )
    .limit(1);
  if (!row) throw new BrowserResearchScopeError("Browser research run not found.");

  const sourceRows = row.scope.evidenceRefs.length
    ? await database
        .select()
        .from(approvedSources)
        .where(
          and(
            eq(approvedSources.participantId, participantId),
            inArray(approvedSources.id, row.scope.evidenceRefs),
          ),
        )
        .orderBy(asc(approvedSources.approvedAt), asc(approvedSources.id))
    : [];
  const sources = sourceRows.map((source) => ({
    id: source.id,
    url: source.url,
    label: source.label,
    title: source.extractedTitle,
    excerpt: source.evidenceExcerpt,
    status: source.researchStatus,
  }));
  return {
    run: await getAgentRun(participantId, agentRunId),
    sources,
    completedCount: sources.filter((source) => source.status === "complete").length,
    totalCount: sources.length,
    nextSourceId:
      sources.find((source) => source.status === "approved")?.id ?? null,
    ambiguousSourceIds: sources
      .filter((source) =>
        source.status === "researching" || source.status === "failed",
      )
      .map((source) => source.id),
  };
}

export async function prepareBrowserResearch(input: {
  participantId: string;
  authorization: RuntimeLeaseAuthorization;
  idempotencyKey: string;
  agentName?: string;
  focus: string;
  sources: BrowserResearchSourceInput[];
  backgroundContinuationAllowed: boolean;
  fallbackBudgetCredits: number;
}): Promise<BrowserResearchProgress> {
  await requireRuntimeLease(input.participantId, input.authorization);
  await requireParticipationCapability(
    input.participantId,
    "publicSourceResearch",
  );
  if (input.backgroundContinuationAllowed) {
    await requireParticipationCapability(
      input.participantId,
      "backgroundContinuation",
    );
  }
  const normalized = normalizeSources(input.sources);
  const run = await startAgentRun({
    participantId: input.participantId,
    authorization: input.authorization,
    idempotencyKey: input.idempotencyKey,
    purpose: `Research approved sources for: ${input.focus}`.slice(0, 240),
    backgroundContinuationAllowed: input.backgroundContinuationAllowed,
    fallbackBudgetCredits: input.fallbackBudgetCredits,
    taskType: BROWSER_RESEARCH_TASK_TYPE,
  });

  const database = getDatabase();
  const [stored] = await database
    .select({ scope: agentRuns.approvedScope })
    .from(agentRuns)
    .where(eq(agentRuns.id, run.id))
    .limit(1);
  if (stored?.scope.evidenceRefs.length) {
    const existing = await loadProgress(input.participantId, run.id);
    const existingUrls = existing.sources.map((source) => source.url);
    if (
      existingUrls.length !== normalized.length ||
      existingUrls.some((url, index) => url !== normalized[index]?.url)
    ) {
      throw new BrowserResearchScopeError(
        "The idempotency key already has a different approved source scope.",
      );
    }
    return existing;
  }

  await database
    .delete(observations)
    .where(eq(observations.participantId, input.participantId));
  await database
    .delete(approvedSources)
    .where(eq(approvedSources.participantId, input.participantId));
  await database
    .update(participants)
    .set({
      agentName: input.agentName,
      intent: input.focus,
      status: "onboarding",
      researchProvider: null,
      researchRunReference: null,
      researchCompletedAt: null,
    })
    .where(eq(participants.id, input.participantId));
  await updatePortableAgent(input.participantId, {
    agentName: input.agentName,
    focus: input.focus,
  });
  const sourceRows = await database
    .insert(approvedSources)
    .values(
      normalized.map((source) => ({
        participantId: input.participantId,
        url: source.url,
        label: source.label,
        researchStatus: "approved",
      })),
    )
    .returning({ id: approvedSources.id });
  await setAgentRunEvidenceScope({
    participantId: input.participantId,
    agentRunId: run.id,
    authorization: input.authorization,
    evidenceRefs: sourceRows.map((source) => source.id),
  });
  return loadProgress(input.participantId, run.id);
}

async function refreshObservationProposals(
  participantId: string,
  provider: string,
  runReference: string,
) {
  const database = getDatabase();
  const [participant] = await database
    .select({ focus: participants.intent })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!participant?.focus) {
    throw new BrowserResearchScopeError("The participant research focus is missing.");
  }
  const completed = await database
    .select()
    .from(approvedSources)
    .where(
      and(
        eq(approvedSources.participantId, participantId),
        eq(approvedSources.researchStatus, "complete"),
      ),
    )
    .orderBy(asc(approvedSources.approvedAt), asc(approvedSources.id));
  const evidence: Evidence[] = completed.map((source) => ({
    sourceId: source.id,
    sourceUrl: source.url,
    sourceTitle: source.extractedTitle ?? source.label ?? new URL(source.url).hostname,
    excerpt: source.evidenceExcerpt ?? "",
    observedAt: new Date().toISOString(),
  }));
  await database
    .delete(observations)
    .where(
      and(
        eq(observations.participantId, participantId),
        eq(observations.status, "pending"),
      ),
    );
  const drafts = synthesizeObservationDrafts(participant.focus, evidence);
  if (drafts.length) {
    await database.insert(observations).values(
      drafts.map((draft) => ({ ...draft, participantId })),
    );
  }
  await database
    .update(participants)
    .set({ researchProvider: provider, researchRunReference: runReference })
    .where(eq(participants.id, participantId));
}

async function researchSource(input: {
  participantId: string;
  agentRunId: string;
  sourceId: string;
  billingIdempotencyKey: string;
  adapter: BrowserResearchAdapter;
}) {
  const database = getDatabase();
  const [run] = await database
    .select({ scope: agentRuns.approvedScope })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.id, input.agentRunId),
        eq(agentRuns.participantId, input.participantId),
        eq(agentRuns.approvedTaskType, BROWSER_RESEARCH_TASK_TYPE),
      ),
    )
    .limit(1);
  if (!run?.scope.evidenceRefs.includes(input.sourceId)) {
    throw new BrowserResearchScopeError("The source is outside the approved run scope.");
  }
  const [source] = await database
    .select()
    .from(approvedSources)
    .where(
      and(
        eq(approvedSources.id, input.sourceId),
        eq(approvedSources.participantId, input.participantId),
        eq(approvedSources.researchStatus, "approved"),
      ),
    )
    .limit(1);
  if (!source) {
    throw new BrowserResearchScopeError(
      "This source is complete, failed, or already being researched; Sylla will not revisit it automatically.",
    );
  }

  const reservation = await reserveBillableOperation({
    participantId: input.participantId,
    operation: "browser_source",
    idempotencyKey: input.billingIdempotencyKey,
  });
  if (reservation.alreadyProcessed) {
    throw new BrowserResearchScopeError(
      "The billed Browser operation already completed; refusing a duplicate visit.",
    );
  }

  const [claimedSource] = await database
    .update(approvedSources)
    .set({ researchStatus: "researching" })
    .where(
      and(
        eq(approvedSources.id, source.id),
        eq(approvedSources.participantId, input.participantId),
        eq(approvedSources.researchStatus, "approved"),
      ),
    )
    .returning({ id: approvedSources.id });
  if (!claimedSource) {
    await releaseBillableOperation(reservation);
    throw new BrowserResearchScopeError(
      "Another worker claimed this source; Sylla will not issue a duplicate visit.",
    );
  }

  try {
    const result = await input.adapter.research({
      participantRef: input.participantId,
      sources: [
        { id: source.id, url: source.url, label: source.label ?? undefined },
      ],
    });
    const evidence = result.evidence.find((item) => item.sourceId === source.id);
    if (!evidence) throw new Error("Solari Browser returned no evidence for the source.");
    await database
      .update(approvedSources)
      .set({
        url: evidence.sourceUrl,
        extractedTitle: evidence.sourceTitle,
        evidenceExcerpt: evidence.excerpt,
        researchStatus: "complete",
      })
      .where(eq(approvedSources.id, source.id));
    await settleBillableOperation(reservation, result.runReference);
    await refreshObservationProposals(
      input.participantId,
      result.provider,
      result.runReference,
    );
    return result;
  } catch (error) {
    await database
      .update(approvedSources)
      .set({ researchStatus: "failed" })
      .where(
        and(
          eq(approvedSources.id, source.id),
          eq(approvedSources.researchStatus, "researching"),
        ),
      );
    await releaseBillableOperation(reservation);
    throw error;
  }
}

function progressCheckpoint(progress: BrowserResearchProgress) {
  const completeIds = progress.sources
    .filter((source) => source.status === "complete")
    .map((source) => source.id);
  return {
    summary: `Researched ${completeIds.length} of ${progress.totalCount} approved sources with Solari Browser.`,
    completedActions: completeIds.map((id) => `researched_source:${id}`),
    nextAction: progress.nextSourceId
      ? `Research approved source ${progress.nextSourceId}`
      : progress.ambiguousSourceIds.length
        ? "Review ambiguous Browser source state before retrying"
        : null,
    evidenceRefs: completeIds,
  };
}

export async function researchNextBrowserSource(input: {
  participantId: string;
  agentRunId: string;
  authorization: RuntimeLeaseAuthorization;
  idempotencyKey: string;
  adapter?: BrowserResearchAdapter;
}): Promise<BrowserResearchProgress> {
  await requireRuntimeLease(input.participantId, input.authorization);
  const before = await loadProgress(input.participantId, input.agentRunId);
  if (before.run.status !== "host_orchestrated") {
    throw new BrowserResearchScopeError("The host does not own this Browser run.");
  }
  if (!before.nextSourceId) return before;
  const adapter = input.adapter ?? (await createSolariAdapters()).browser;
  await researchSource({
    participantId: input.participantId,
    agentRunId: input.agentRunId,
    sourceId: before.nextSourceId,
    billingIdempotencyKey: input.idempotencyKey,
    adapter,
  });
  const progress = await loadProgress(input.participantId, input.agentRunId);
  await checkpointAgentRun({
    participantId: input.participantId,
    agentRunId: input.agentRunId,
    authorization: input.authorization,
    checkpoint: progressCheckpoint(progress),
  });
  if (
    progress.completedCount === progress.totalCount &&
    progress.ambiguousSourceIds.length === 0
  ) {
    const database = getDatabase();
    await database
      .update(participants)
      .set({ status: "ready", researchCompletedAt: new Date() })
      .where(eq(participants.id, input.participantId));
    await completeHostAgentRun({
      participantId: input.participantId,
      agentRunId: input.agentRunId,
      authorization: input.authorization,
    });
  }
  return loadProgress(input.participantId, input.agentRunId);
}

async function processBrowserFallback(input: {
  participantId: string;
  agentRunId: string;
  workerId?: string;
  adapter: BrowserResearchAdapter;
}) {
  const authorization = await acquireRuntimeLease({
    participantId: input.participantId,
    clientId: input.workerId ?? "sylla-browser-controller",
    runId: `browser-fallback:${input.agentRunId}:${randomUUID()}`,
    purpose: "Finish approved Solari Browser sources",
    durationSeconds: 300,
  });
  try {
    const claim = await claimAgentRunForFallback({
      participantId: input.participantId,
      agentRunId: input.agentRunId,
      authorization,
      taskType: BROWSER_RESEARCH_TASK_TYPE,
      allowedAction: "research_approved_source",
      provider: "solari-browser",
      model: null,
      fallbackCost: BROWSER_SOURCE_FALLBACK_COST,
    });
    if (!claim) {
      return { executed: false, run: await getAgentRun(input.participantId, input.agentRunId) };
    }

    let progress = await loadProgress(input.participantId, input.agentRunId);
    let providerError = progress.run.fallbackError;
    try {
      while (progress.nextSourceId) {
        const sourceId = progress.nextSourceId;
        await researchSource({
          participantId: input.participantId,
          agentRunId: input.agentRunId,
          sourceId,
          billingIdempotencyKey: `browser-fallback:${input.agentRunId}:${sourceId}`,
          adapter: input.adapter,
        });
        progress = await loadProgress(input.participantId, input.agentRunId);
      }
    } catch (error) {
      providerError = safeErrorMessage(error);
      progress = await loadProgress(input.participantId, input.agentRunId);
    }

    const allComplete =
      progress.totalCount > 0 &&
      progress.completedCount === progress.totalCount &&
      progress.ambiguousSourceIds.length === 0;
    if (allComplete) {
      await getDatabase()
        .update(participants)
        .set({ status: "ready", researchCompletedAt: new Date() })
        .where(eq(participants.id, input.participantId));
    }
    const checkpoint = progressCheckpoint(progress);
    await completeAgentRunFallback({
      participantId: input.participantId,
      agentRunId: input.agentRunId,
      authorization,
      checkpoint,
      output: {
        summary: allComplete
          ? checkpoint.summary
          : `${checkpoint.summary} Sylla stopped safely without revisiting an ambiguous source.`,
        nextAction: allComplete
          ? "Reconnect to review and approve the proposed memories"
          : checkpoint.nextAction,
        provider: "solari-browser",
        model: null,
        inputTokens: null,
        outputTokens: null,
        deterministicRecoveryUsed: true,
      },
      modelError: providerError,
    });
    return { executed: true, run: await getAgentRun(input.participantId, input.agentRunId) };
  } finally {
    await releaseRuntimeLease(input.participantId, authorization).catch(() => undefined);
  }
}

export async function sweepBrowserResearchRuns(input: {
  limit?: number;
  workerId?: string;
  adapter?: BrowserResearchAdapter;
} = {}): Promise<FallbackSweepResult> {
  const database = getDatabase();
  const limit = Math.min(20, Math.max(1, Math.round(input.limit ?? 10)));
  const staleBefore = new Date(Date.now() - STALE_BROWSER_FALLBACK_MS);
  const candidates = await database.execute<{
    agent_run_id: string;
    participant_id: string;
  }>(sql`
    select id as agent_run_id, participant_id
    from agent_runs
    where approved_task_type = ${BROWSER_RESEARCH_TASK_TYPE}
      and approved_scope @> '{"allowedActions":["research_approved_source"]}'::jsonb
      and background_continuation_allowed = true
      and not exists (
        select 1 from ${runHandoffs}
        where ${runHandoffs.agentRunId} = ${agentRuns.id}
      )
      and (
        (
          status in ('host_orchestrated', 'waiting_for_host')
          and fallback_credits_used + ${BROWSER_SOURCE_FALLBACK_COST}
            <= fallback_budget_credits
        )
        or (status = 'fallback_running' and fallback_claimed_at <= ${staleBefore})
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
  const adapter = input.adapter ?? (await createSolariAdapters()).browser;
  for (const candidate of candidates.rows) {
    try {
      const processed = await processBrowserFallback({
        participantId: candidate.participant_id,
        agentRunId: candidate.agent_run_id,
        workerId: input.workerId,
        adapter,
      });
      if (processed.executed) result.executed += 1;
      else result.skipped += 1;
    } catch (error) {
      if (error instanceof RuntimeLeaseConflictError) result.skipped += 1;
      else {
        result.failed += 1;
        result.failures.push({
          agentRunId: candidate.agent_run_id,
          error: safeErrorMessage(error),
        });
      }
    }
  }
  return result;
}

export async function getBrowserResearchProgress(
  participantId: string,
  agentRunId: string,
) {
  return loadProgress(participantId, agentRunId);
}
