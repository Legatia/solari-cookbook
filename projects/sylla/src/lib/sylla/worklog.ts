import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  agentRuns,
  observations,
  runCheckpoints,
  runHandoffs,
  usageLedger,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";

/**
 * What the agent did, and whether anyone was watching.
 *
 * Sylla asks people to let an agent work after they have closed the chat. That
 * is only a reasonable thing to ask if they can afterwards see exactly what
 * happened, so this is the receipt: every run, who drove it, what it actually
 * did, what it cost, and — the question nobody asks out loud but everybody has
 * — whether anything irreversible happened while they were not there.
 *
 * It answers that last one explicitly rather than leaving it to be inferred
 * from an empty list, because "nothing happened" and "I cannot tell" look
 * identical otherwise.
 */

const DEFAULT_WINDOW_DAYS = 30;

/** Whether the participant was present, in the terms they would use. */
export type Attendance = "with_you" | "while_you_were_away";

export type WorkLogEntry = {
  id: string;
  purpose: string;
  taskType: string;
  attendance: Attendance;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  /** What it got done, taken from its own checkpoints rather than restated. */
  completedActions: string[];
  nextAction: string | null;
  creditsSpent: number;
  /** Only ever true when the agent was acting alone, and stated plainly. */
  consequential: boolean;
  /** Which model stood in, when one did. Named, not hidden behind "the agent". */
  ranOn: string | null;
  /** Whether a provider failure forced canned text instead of a real summary. */
  degraded: boolean;
  evidenceProduced: number;
  /**
   * Whether a recording of this run exists to be watched.
   *
   * The link itself is not here: replay URLs are presigned and short lived, so
   * one is minted when somebody actually asks rather than baked into a list
   * that may be read days later.
   */
  replayAvailable: boolean;
};

export type WorkLog = {
  since: string;
  runs: number;
  unattendedRuns: number;
  creditsSpent: number;
  /**
   * The trust headline. False means Sylla is asserting that nothing
   * irreversible happened unattended in this window — not that it does not
   * know.
   */
  consequentialWhileAway: boolean;
  entries: WorkLogEntry[];
};

function attendanceOf(mode: string): Attendance {
  return mode === "host_orchestrated" ? "with_you" : "while_you_were_away";
}

export async function buildWorkLog(
  participantId: string,
  options: { days?: number; limit?: number } = {},
): Promise<WorkLog> {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const days = Math.min(365, Math.max(1, options.days ?? DEFAULT_WINDOW_DAYS));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));

  const runs = await database
    .select({
      id: agentRuns.id,
      purpose: agentRuns.purpose,
      taskType: agentRuns.approvedTaskType,
      executionMode: agentRuns.executionMode,
      status: agentRuns.status,
      createdAt: agentRuns.createdAt,
      completedAt: agentRuns.completedAt,
      fallbackCreditsUsed: agentRuns.fallbackCreditsUsed,
      fallbackProvider: agentRuns.fallbackProvider,
      fallbackModel: agentRuns.fallbackModel,
      replaySessionId: agentRuns.replaySessionId,
    })
    .from(agentRuns)
    .where(
      and(eq(agentRuns.participantId, participantId), gte(agentRuns.createdAt, since)),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);

  const runIds = runs.map((run) => run.id);

  // Latest checkpoint per run says what was actually done; the handoff says
  // whether it did anything that cannot be taken back.
  const [checkpoints, handoffs, evidence, spend] = await Promise.all([
    runIds.length
      ? database
          .select({
            agentRunId: runCheckpoints.agentRunId,
            sequence: runCheckpoints.sequence,
            resumableState: runCheckpoints.resumableState,
          })
          .from(runCheckpoints)
          .where(inArray(runCheckpoints.agentRunId, runIds))
          .orderBy(desc(runCheckpoints.sequence))
      : [],
    runIds.length
      ? database
          .select({ agentRunId: runHandoffs.agentRunId, details: runHandoffs.details })
          .from(runHandoffs)
          .where(inArray(runHandoffs.agentRunId, runIds))
      : [],
    runIds.length
      ? database
          .select({ agentRunId: observations.agentRunId })
          .from(observations)
          .where(inArray(observations.agentRunId, runIds))
      : [],
    database
      .select({
        actualCredits: usageLedger.actualCredits,
        estimatedCredits: usageLedger.estimatedCredits,
        status: usageLedger.status,
      })
      .from(usageLedger)
      .where(
        and(eq(usageLedger.userId, identity.userId), gte(usageLedger.createdAt, since)),
      ),
  ]);

  const latestCheckpoint = new Map<string, (typeof checkpoints)[number]>();
  for (const checkpoint of checkpoints) {
    if (!latestCheckpoint.has(checkpoint.agentRunId)) {
      latestCheckpoint.set(checkpoint.agentRunId, checkpoint);
    }
  }
  const handoffByRun = new Map<string, (typeof handoffs)[number]["details"]>();
  for (const handoff of handoffs) handoffByRun.set(handoff.agentRunId, handoff.details);

  const evidenceCount = new Map<string, number>();
  for (const row of evidence) {
    if (!row.agentRunId) continue;
    evidenceCount.set(row.agentRunId, (evidenceCount.get(row.agentRunId) ?? 0) + 1);
  }

  const entries: WorkLogEntry[] = runs.map((run) => {
    const checkpoint = latestCheckpoint.get(run.id);
    const handoff = handoffByRun.get(run.id);
    const attendance = attendanceOf(run.executionMode);
    return {
      id: run.id,
      purpose: run.purpose,
      taskType: run.taskType,
      attendance,
      status: run.status,
      startedAt: run.createdAt.toISOString(),
      finishedAt: run.completedAt?.toISOString() ?? null,
      completedActions: checkpoint?.resumableState?.completedActions ?? [],
      nextAction: checkpoint?.resumableState?.nextAction ?? null,
      creditsSpent: run.fallbackCreditsUsed,
      // Only meaningful unattended: work done with someone present was done in
      // front of them.
      consequential:
        attendance === "while_you_were_away" &&
        Boolean(handoff?.consequentialActionsTaken),
      ranOn:
        handoff?.model ??
        run.fallbackModel ??
        (run.fallbackProvider || handoff?.modelProvider) ??
        null,
      degraded: Boolean(handoff?.deterministicRecoveryUsed),
      evidenceProduced: evidenceCount.get(run.id) ?? 0,
      replayAvailable: Boolean(run.replaySessionId),
    };
  });

  // Settled cost where it exists, reservation where a run is still in flight.
  const creditsSpent = spend
    .filter((row) => row.status !== "released" && row.status !== "declined")
    .reduce((total, row) => total + (row.actualCredits ?? row.estimatedCredits), 0);

  return {
    since: since.toISOString(),
    runs: entries.length,
    unattendedRuns: entries.filter((one) => one.attendance === "while_you_were_away")
      .length,
    creditsSpent,
    consequentialWhileAway: entries.some((one) => one.consequential),
    entries,
  };
}
