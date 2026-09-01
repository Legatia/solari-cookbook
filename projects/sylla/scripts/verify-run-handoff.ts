import "../env-config";

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  events,
  participants,
  personalAgents,
  syllaUsers,
} from "../src/db/schema";
import {
  acquireRuntimeLease,
  releaseRuntimeLease,
} from "../src/lib/sylla/leases";
import {
  acknowledgeAgentRunHandoff,
  checkpointAgentRun,
  executeFallbackOnce,
  getAgentRun,
  startAgentRun,
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

  console.log(
    JSON.stringify({
      verified: true,
      activeLeaseBlockedFallback: true,
      concurrentWorkers: race.length,
      fallbackExecutions: 1,
      fallbackCreditsUsed: completed.fallbackCreditsUsed,
      reconnectAcknowledged: true,
      consequentialActionsTaken: false,
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
