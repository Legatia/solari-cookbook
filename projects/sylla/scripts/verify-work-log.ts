import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  agentRuns,
  events,
  participants,
  personalAgents,
  syllaUsers,
} from "../src/db/schema";
import { ensurePortableIdentity } from "../src/lib/sylla/identity";
import { acquireRuntimeLease, releaseRuntimeLease } from "../src/lib/sylla/leases";
import {
  checkpointAgentRun,
  executeFallbackOnce,
  startAgentRun,
  yieldAgentRunToBackground,
} from "../src/lib/sylla/runs";
import { buildWorkLog } from "../src/lib/sylla/worklog";

/**
 * The receipt for work done unattended.
 *
 * Sylla asks people to let an agent carry on after they have closed the chat.
 * The log is what makes that a reasonable thing to ask, so what matters is that
 * it is specific — which run, whose hand was on it, what it cost, which model
 * stood in — and that its assurance is an assertion rather than an empty list.
 */
async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `worklog-${syntheticId}`;
  let participantId: string | undefined;
  const observed: Record<string, unknown> = {};

  try {
    const [event] = await database
      .insert(events)
      .values({ slug: eventSlug, name: "Synthetic work log", status: "open" })
      .returning();
    const [participant] = await database
      .insert(participants)
      .values({
        eventId: event.id,
        inviteTokenHash: `worklog-${syntheticId}`,
        displayName: "Synthetic participant",
        ageConfirmed: true,
        status: "ready",
      })
      .returning();
    participantId = participant.id;
    await ensurePortableIdentity(participantId);

    // Nothing has happened yet. The log must say so as a claim, not by being
    // empty — "nothing happened" and "I cannot tell" must not look alike.
    const fresh = await buildWorkLog(participantId);
    assert.equal(fresh.runs, 0);
    assert.equal(fresh.consequentialWhileAway, false);
    observed.assuranceIsStatedNotInferred = true;

    const hostLease = await acquireRuntimeLease({
      participantId,
      clientId: "synthetic-host",
      runId: `host-${syntheticId}`,
      purpose: "Verify the work log",
      durationSeconds: 30,
    });
    const run = await startAgentRun({
      participantId,
      authorization: hostLease,
      idempotencyKey: `worklog-run-${syntheticId}`,
      purpose: "Read one approved source and prepare it for review",
      backgroundContinuationAllowed: true,
      fallbackBudgetCredits: 1,
    });
    await checkpointAgentRun({
      participantId,
      agentRunId: run.id,
      authorization: hostLease,
      checkpoint: {
        summary: "Read the source the participant approved.",
        completedActions: ["Read the approved source"],
        nextAction: "Ask the participant to review the evidence",
        evidenceRefs: ["synthetic-source-1"],
      },
    });

    // While the host is driving, this is work done in front of them.
    const attended = await buildWorkLog(participantId);
    assert.equal(attended.runs, 1);
    assert.equal(attended.entries[0].attendance, "with_you");
    assert.equal(attended.unattendedRuns, 0);
    assert.deepEqual(attended.entries[0].completedActions, [
      "Read the approved source",
    ]);
    observed.attendedWorkIsMarkedAsSuch = true;

    // The host goes away and the background worker finishes the job.
    await yieldAgentRunToBackground({
      participantId,
      agentRunId: run.id,
      authorization: hostLease,
    });
    const executed = await executeFallbackOnce({
      participantId,
      agentRunId: run.id,
      workerId: "synthetic-worker",
    });
    assert.equal(executed.executed, true);

    const after = await buildWorkLog(participantId);
    const entry = after.entries.find((one) => one.id === run.id);
    assert.ok(entry);
    assert.equal(entry.attendance, "while_you_were_away");
    assert.equal(after.unattendedRuns, 1);
    observed.unattendedWorkIsDistinguished = true;

    // What it cost and what stood in for the host are both named. An agent that
    // ran on something is not the same as an agent that ran.
    assert.equal(entry.creditsSpent, 1, "the run reports what it spent");
    assert.ok(entry.ranOn, "the log names what actually produced the summary");
    observed.costAndModelAreNamed = true;

    // The unattended path cannot take consequential action by construction, so
    // this is an invariant rather than an observation about one quiet week.
    assert.equal(entry.consequential, false);
    assert.equal(after.consequentialWhileAway, false);
    observed.unattendedWorkIsNeverConsequential = true;

    // What it did comes from its own checkpoints, not from restating the ask.
    assert.deepEqual(entry.completedActions, ["Read the approved source"]);
    assert.notEqual(entry.completedActions[0], entry.purpose);
    observed.reportsWhatItDidNotWhatItWasAsked = true;

    // ---- Replay ------------------------------------------------------------
    //
    // Nothing recorded means nothing offered: the log must not show a watch
    // control that leads to a dead link.
    assert.equal(entry.replayAvailable, false);

    await database
      .update(agentRuns)
      .set({ replaySessionId: "synthetic-browser-session" })
      .where(eq(agentRuns.id, run.id));
    const withReplay = await buildWorkLog(participantId);
    assert.equal(
      withReplay.entries.find((one) => one.id === run.id)?.replayAvailable,
      true,
    );
    // The link itself is deliberately absent: it is presigned and short lived,
    // so it is minted when somebody presses watch rather than listed here.
    assert.ok(
      !JSON.stringify(withReplay).includes("http"),
      "a work log must carry no replay URL that can go stale",
    );
    observed.replayOfferedNotStored = true;

    // A window that predates the work shows none of it.
    const narrow = await buildWorkLog(participantId, { days: 1 });
    assert.equal(narrow.runs, 1, "today's work is inside a one day window");
    const runRow = await database
      .update(agentRuns)
      .set({ createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000) })
      .where(eq(agentRuns.id, run.id))
      .returning({ id: agentRuns.id });
    assert.ok(runRow.length);
    assert.equal((await buildWorkLog(participantId, { days: 30 })).runs, 0);
    observed.windowIsHonoured = true;

    await releaseRuntimeLease(participantId, hostLease).catch(() => undefined);

    console.log(JSON.stringify({ verified: true, ...observed }));
  } finally {
    if (participantId) {
      const [row] = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);
      await database.delete(agentRuns).where(eq(agentRuns.participantId, participantId));
      await database.delete(participants).where(eq(participants.id, participantId));
      if (row?.agentId) {
        await database.delete(personalAgents).where(eq(personalAgents.id, row.agentId));
      }
      if (row?.userId) {
        await database.delete(syllaUsers).where(eq(syllaUsers.id, row.userId));
      }
    }
    await database.delete(events).where(eq(events.slug, eventSlug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
