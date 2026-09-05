import { desc, eq } from "drizzle-orm";

import { getDatabase } from "@/db";
import { cronRuns } from "@/db/schema";

/**
 * Scheduler monitoring.
 *
 * A cron that stops firing produces no error and no log line — it produces
 * nothing at all, which is exactly what a healthy idle system produces. The
 * only way to tell those apart is to record every run and then notice the
 * absence of recent ones.
 *
 * That matters here because the sweep is what finishes work a participant
 * already approved after their chat closed. Silence means their work is
 * stranded, and nobody would know.
 */

/** Daily cron on Vercel Hobby, so anything past a day and a half is late. */
const STALE_AFTER_MS = 36 * 60 * 60 * 1_000;

export async function beginCronRun(job: string) {
  const [row] = await getDatabase()
    .insert(cronRuns)
    .values({ job })
    .returning({ id: cronRuns.id });
  return row.id;
}

export async function finishCronRun(
  id: string,
  outcome: {
    ok: boolean;
    executed?: number;
    skipped?: number;
    failed?: number;
    detail?: string;
  },
) {
  await getDatabase()
    .update(cronRuns)
    .set({
      finishedAt: new Date(),
      ok: outcome.ok,
      executed: outcome.executed ?? 0,
      skipped: outcome.skipped ?? 0,
      failed: outcome.failed ?? 0,
      detail: outcome.detail?.slice(0, 500) ?? null,
    })
    .where(eq(cronRuns.id, id));
}

export type CronHealth = {
  job: string;
  configured: boolean;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastDetail: string | null;
  stale: boolean;
  neverRun: boolean;
};

/**
 * Health for one job, shaped so an uptime check can read a single boolean.
 *
 * A run that started and never finished is as bad as one that never started —
 * both mean the sweep is not completing — so an unfinished run counts as stale
 * once it is old enough.
 */
export async function cronHealth(job = "fallback-sweep"): Promise<CronHealth> {
  const [last] = await getDatabase()
    .select()
    .from(cronRuns)
    .where(eq(cronRuns.job, job))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1);

  const configured = Boolean(process.env.CRON_SECRET);
  if (!last) {
    return {
      job,
      configured,
      lastRunAt: null,
      lastFinishedAt: null,
      lastOk: null,
      lastDetail: null,
      stale: true,
      neverRun: true,
    };
  }

  const reference = last.finishedAt ?? last.startedAt;
  return {
    job,
    configured,
    lastRunAt: last.startedAt.toISOString(),
    lastFinishedAt: last.finishedAt?.toISOString() ?? null,
    lastOk: last.finishedAt ? last.ok : null,
    lastDetail: last.detail,
    stale: Date.now() - reference.getTime() > STALE_AFTER_MS,
    neverRun: false,
  };
}
