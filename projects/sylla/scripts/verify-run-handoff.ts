import "../env-config";

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  agentRuns,
  events,
  participants,
  personalAgents,
  syllaUsers,
} from "../src/db/schema";
import type { InternalModelAdapter } from "../src/lib/sylla/internal-model";
import {
  acquireRuntimeLease,
  releaseRuntimeLease,
  RuntimeLeaseConflictError,
} from "../src/lib/sylla/leases";
import {
  acknowledgeAgentRunHandoff,
  checkpointAgentRun,
  executeFallbackOnce,
  getAgentRun,
  startAgentRun,
  sweepFallbackRuns,
  yieldAgentRunToBackground,
} from "../src/lib/sylla/runs";

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `handoff-verification-${syntheticId}`;
  let participantId: string | undefined;

  try {
  const [event] = await database
    .insert(events)
    .values({
      slug: eventSlug,
      name: "Synthetic handoff verification",
      status: "open",
    })
    .returning();
  const [participant] = await database
    .insert(participants)
    .values({
      eventId: event.id,
      inviteTokenHash: `synthetic-${syntheticId}`,
      displayName: "Synthetic participant",
      agentName: "Synthetic agent",
      intent: "Verify bounded host-loss recovery.",
      ageConfirmed: true,
      status: "ready",
    })
    .returning();
  const runParticipantId = participant.id;
  participantId = runParticipantId;

  const hostLease = await acquireRuntimeLease({
    participantId: runParticipantId,
    clientId: "synthetic-host-a",
    runId: `host-a-${syntheticId}`,
    purpose: "Verify host-loss handoff",
    durationSeconds: 30,
  });
  const run = await startAgentRun({
    participantId: runParticipantId,
    authorization: hostLease,
    idempotencyKey: `run-${syntheticId}`,
    purpose: "Preserve an explicit checkpoint across host loss",
    backgroundContinuationAllowed: true,
    fallbackBudgetCredits: 1,
  });
  await checkpointAgentRun({
    participantId: runParticipantId,
    agentRunId: run.id,
    authorization: hostLease,
    checkpoint: {
      summary: "The host collected one participant-approved source.",
      completedActions: ["Collected approved source"],
      nextAction: "Ask the participant to review the evidence",
      evidenceRefs: ["synthetic-source-1"],
    },
  });

  const blockedWhileHostActive = await Promise.all(
    Array.from({ length: 2 }, () =>
      executeFallbackOnce({
        participantId: runParticipantId,
        agentRunId: run.id,
      }),
    ),
  );
  assert.equal(
    blockedWhileHostActive.filter((attempt) => attempt.executed).length,
    0,
  );

  await yieldAgentRunToBackground({
    participantId: runParticipantId,
    agentRunId: run.id,
    authorization: hostLease,
  });
  const race = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      executeFallbackOnce({
        participantId: runParticipantId,
        agentRunId: run.id,
        workerId: `synthetic-worker-${index}`,
      }),
    ),
  );
  assert.equal(race.filter((attempt) => attempt.executed).length, 1);

  const completed = await getAgentRun(runParticipantId, run.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.executionMode, "internal_fallback");
  assert.equal(completed.fallbackCreditsUsed, 1);
  assert.equal(completed.latestCheckpoint?.sequence, 2);
  assert.equal(completed.latestCheckpoint?.createdBy, "internal_fallback");
  assert.equal(completed.handoff?.consequentialActionsTaken, false);
  assert.equal(completed.handoff?.modelProvider, "sylla-deterministic");
  assert.deepEqual(completed.handoff?.completedActions, [
    "Collected approved source",
  ]);

  const repeat = await executeFallbackOnce({
    participantId: runParticipantId,
    agentRunId: run.id,
  });
  assert.equal(repeat.executed, false);

  const reconnectLease = await acquireRuntimeLease({
    participantId: runParticipantId,
    clientId: "synthetic-host-b",
    runId: `host-b-${syntheticId}`,
    purpose: "Read fallback handoff",
    durationSeconds: 30,
  });
  const acknowledged = await acknowledgeAgentRunHandoff({
    participantId: runParticipantId,
    agentRunId: run.id,
    authorization: reconnectLease,
  });
  assert.ok(acknowledged.handoff?.acknowledgedAt);
  await releaseRuntimeLease(runParticipantId, reconnectLease);

  const failingAdapter: InternalModelAdapter = {
    provider: "synthetic-model",
    model: "synthetic-model-v1",
    async generateReconnectHandoff() {
      throw new Error("Synthetic model timeout");
    },
  };
  const sweepLease = await acquireRuntimeLease({
    participantId: runParticipantId,
    clientId: "synthetic-host-c",
    runId: `host-c-${syntheticId}`,
    purpose: "Verify automatic fallback sweep",
    durationSeconds: 30,
  });
  const sweptRun = await startAgentRun({
    participantId: runParticipantId,
    authorization: sweepLease,
    idempotencyKey: `sweep-${syntheticId}`,
    purpose: "Verify deterministic recovery after model failure",
    backgroundContinuationAllowed: true,
    fallbackBudgetCredits: 1,
  });
  await checkpointAgentRun({
    participantId: runParticipantId,
    agentRunId: sweptRun.id,
    authorization: sweepLease,
    checkpoint: {
      summary: "The host prepared an automatic sweep checkpoint.",
      completedActions: ["Prepared sweep checkpoint"],
      nextAction: "Review automatic continuation",
      evidenceRefs: [],
    },
  });
  await yieldAgentRunToBackground({
    participantId: runParticipantId,
    agentRunId: sweptRun.id,
    authorization: sweepLease,
  });
  const sweep = await sweepFallbackRuns({
    limit: 10,
    workerId: "synthetic-cron",
    adapter: failingAdapter,
  });
  assert.equal(sweep.executed, 1);
  assert.equal(sweep.failed, 0);
  const swept = await getAgentRun(runParticipantId, sweptRun.id);
  assert.equal(swept.handoff?.deterministicRecoveryUsed, true);
  assert.equal(swept.handoff?.modelProvider, "sylla-deterministic");
  assert.equal(swept.fallbackProvider, "synthetic-model");
  assert.equal(swept.fallbackModel, "synthetic-model-v1");
  assert.match(swept.fallbackError ?? "", /Synthetic model timeout/);

  const staleLease = await acquireRuntimeLease({
    participantId: runParticipantId,
    clientId: "synthetic-host-d",
    runId: `host-d-${syntheticId}`,
    purpose: "Verify stale worker recovery",
    durationSeconds: 30,
  });
  const staleRun = await startAgentRun({
    participantId: runParticipantId,
    authorization: staleLease,
    idempotencyKey: `stale-${syntheticId}`,
    purpose: "Recover a crashed fallback worker",
    backgroundContinuationAllowed: true,
    fallbackBudgetCredits: 1,
  });
  await checkpointAgentRun({
    participantId: runParticipantId,
    agentRunId: staleRun.id,
    authorization: staleLease,
    checkpoint: {
      summary: "The host checkpointed before the synthetic crash.",
      completedActions: ["Checkpointed before crash"],
      nextAction: "Recover safely",
      evidenceRefs: [],
    },
  });
  await yieldAgentRunToBackground({
    participantId: runParticipantId,
    agentRunId: staleRun.id,
    authorization: staleLease,
  });
  await database
    .update(agentRuns)
    .set({
      status: "fallback_running",
      executionMode: "internal_fallback",
      fallbackCreditsUsed: 1,
      checkpointSequence: 2,
      fallbackWorkerRunId: "expired-synthetic-worker",
      fallbackClaimedAt: new Date(Date.now() - 10 * 60 * 1_000),
    })
    .where(eq(agentRuns.id, staleRun.id));
  const staleSweep = await sweepFallbackRuns({
    limit: 10,
    workerId: "synthetic-recovery-cron",
    adapter: failingAdapter,
  });
  assert.equal(staleSweep.executed, 1);
  const recovered = await getAgentRun(runParticipantId, staleRun.id);
  assert.equal(recovered.fallbackCreditsUsed, 1);
  assert.equal(recovered.latestCheckpoint?.sequence, 2);
  assert.equal(recovered.handoff?.deterministicRecoveryUsed, true);
  assert.match(recovered.fallbackError ?? "", /Recovered a stale/);

  const overlapLease = await acquireRuntimeLease({
    participantId: runParticipantId,
    clientId: "synthetic-host-e",
    runId: `host-e-${syntheticId}`,
    purpose: "Verify model-call lease exclusion",
    durationSeconds: 30,
  });
  const overlapRun = await startAgentRun({
    participantId: runParticipantId,
    authorization: overlapLease,
    idempotencyKey: `overlap-${syntheticId}`,
    purpose: "Block a reconnecting host during internal model work",
    backgroundContinuationAllowed: true,
    fallbackBudgetCredits: 1,
  });
  await yieldAgentRunToBackground({
    participantId: runParticipantId,
    agentRunId: overlapRun.id,
    authorization: overlapLease,
  });
  let releaseModel!: () => void;
  let announceModelStarted!: () => void;
  const modelStarted = new Promise<void>((resolve) => {
    announceModelStarted = resolve;
  });
  const continueModel = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  const blockingAdapter: InternalModelAdapter = {
    provider: "synthetic-blocking-model",
    model: "synthetic-blocking-v1",
    async generateReconnectHandoff() {
      announceModelStarted();
      await continueModel;
      return {
        summary: "The bounded model completed after holding the worker lease.",
        nextAction: "Reconnect safely",
        provider: "synthetic-blocking-model",
        model: "synthetic-blocking-v1",
        inputTokens: 10,
        outputTokens: 8,
        deterministicRecoveryUsed: false,
      };
    },
  };
  const overlapSweepPromise = sweepFallbackRuns({
    limit: 10,
    workerId: "synthetic-overlap-cron",
    adapter: blockingAdapter,
  });
  await modelStarted;
  await assert.rejects(
    acquireRuntimeLease({
      participantId: runParticipantId,
      clientId: "synthetic-returning-host",
      runId: `returning-host-${syntheticId}`,
      purpose: "Attempt overlap with internal model",
      durationSeconds: 30,
    }),
    RuntimeLeaseConflictError,
  );
  releaseModel();
  const overlapSweep = await overlapSweepPromise;
  assert.equal(overlapSweep.executed, 1);
  const overlapCompleted = await getAgentRun(
    runParticipantId,
    overlapRun.id,
  );
  assert.equal(
    overlapCompleted.handoff?.modelProvider,
    "synthetic-blocking-model",
  );

  console.log(
    JSON.stringify({
      verified: true,
      activeLeaseBlockedFallback: true,
      concurrentWorkers: race.length,
      fallbackExecutions: 1,
      fallbackCreditsUsed: completed.fallbackCreditsUsed,
      reconnectAcknowledged: true,
      consequentialActionsTaken: false,
      automaticSweepExecuted: sweep.executed,
      modelFailureRecoveredDeterministically: true,
      staleWorkerRecoveredWithoutDoubleCharge: true,
      returningHostBlockedDuringModelCall: true,
    }),
  );
  } finally {
    if (participantId) {
      await database
        .delete(participants)
        .where(eq(participants.id, participantId));
      await database
        .delete(personalAgents)
        .where(eq(personalAgents.id, participantId));
      await database
        .delete(syllaUsers)
        .where(eq(syllaUsers.id, participantId));
    }
    await database.delete(events).where(eq(events.slug, eventSlug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
