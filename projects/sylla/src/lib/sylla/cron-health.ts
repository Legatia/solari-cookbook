import { desc, eq, lt } from "drizzle-orm";

import { getDatabase } from "@/db";
import { authRateLimits, cronRuns } from "@/db/schema";

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
const MISSED_RUN_AFTER_MS = 36 * 60 * 60 * 1_000;
/** The route has a 60-second ceiling; ten minutes is ample failure grace. */
const UNFINISHED_RUN_AFTER_MS = 10 * 60 * 1_000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1_000;
const CRON_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export function cronRunIsStale(
  run: { startedAt: Date; finishedAt: Date | null },
  now = Date.now(),
) {
  const reference = run.finishedAt ?? run.startedAt;
  const threshold = run.finishedAt
    ? MISSED_RUN_AFTER_MS
    : UNFINISHED_RUN_AFTER_MS;
  return now - reference.getTime() > threshold;
}

export async function beginCronRun(job: string) {
  const now = Date.now();
  const [, , rows] = await getDatabase().batch([
    // These tables are fed by unauthenticated callers and recurring work. A
    // daily bounded cleanup prevents either one growing without limit.
    getDatabase()
      .delete(authRateLimits)
      .where(
        lt(
          authRateLimits.windowStartedAt,
          new Date(now - RATE_LIMIT_RETENTION_MS),
        ),
      ),
    getDatabase()
      .delete(cronRuns)
      .where(
        lt(cronRuns.startedAt, new Date(now - CRON_HISTORY_RETENTION_MS)),
      ),
    getDatabase()
      .insert(cronRuns)
      .values({ job })
      .returning({ id: cronRuns.id }),
  ]);
  const [row] = rows;
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

/** Safe shape for the unauthenticated uptime endpoint. */
export function publicCronHealth(health: CronHealth) {
  return {
    healthy:
      health.configured && !health.stale && health.lastOk !== false,
    sweep: {
      job: health.job,
      configured: health.configured,
      lastRunAt: health.lastRunAt,
      lastFinishedAt: health.lastFinishedAt,
      lastOk: health.lastOk,
      stale: health.stale,
      neverRun: health.neverRun,
    },
  };
}

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

  return {
    job,
    configured,
    lastRunAt: last.startedAt.toISOString(),
    lastFinishedAt: last.finishedAt?.toISOString() ?? null,
    lastOk: last.finishedAt ? last.ok : null,
    lastDetail: last.detail,
    stale: cronRunIsStale(last),
    neverRun: false,
  };
}
