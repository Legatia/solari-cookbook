import { sweepBackgroundRuns } from "@/lib/sylla/background";
import {
  beginCronRun,
  finishCronRun,
  recordRejectedCronCall,
} from "@/lib/sylla/cron-health";
import type { FallbackSweepResult } from "@/lib/sylla/runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SweepFallbacks = (input: {
  limit?: number;
  workerId?: string;
}) => Promise<FallbackSweepResult>;

function configuredLimit() {
  const value = Number.parseInt(
    process.env.SYLLA_FALLBACK_SWEEP_LIMIT ?? "10",
    10,
  );
  return Number.isSafeInteger(value) ? value : 10;
}

export function createFallbackCronHandler(
  sweep: SweepFallbacks = sweepBackgroundRuns,
) {
  return async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return Response.json(
        { ok: false, reason: "cron_not_configured" },
        { status: 503 },
      );
    }
    // Trimmed on both sides: a secret pasted into a dashboard field very
    // easily carries a newline, and an invisible character is a miserable
    // thing to debug through a scheduler that only speaks once a day.
    const presented = request.headers.get("authorization")?.trim() ?? "";
    const expected = `Bearer ${cronSecret.trim()}`;
    if (presented !== expected) {
      // Recorded, because a rejected call and no call at all are the same
      // silence otherwise, and they have opposite fixes. No secret is stored —
      // only whether a header arrived.
      await recordRejectedCronCall(
        "fallback-sweep",
        presented
          ? "A call arrived with an authorization header that did not match CRON_SECRET."
          : "A call arrived with no authorization header.",
      ).catch(() => null);
      return Response.json(
        {
          ok: false,
          reason: presented ? "authorization_mismatch" : "no_authorization_header",
        },
        { status: 401 },
      );
    }

    // Recorded before the work starts, so a sweep that dies mid-run leaves a
    // row that never finished rather than no trace at all.
    const runId = await beginCronRun("fallback-sweep").catch(() => null);
    try {
      const result = await sweep({
        limit: configuredLimit(),
        workerId: "vercel-cron",
      });
      const ok = result.failed === 0;
      if (runId) {
        await finishCronRun(runId, {
          ok,
          executed: result.executed,
          skipped: result.skipped,
          failed: result.failed,
          detail: result.failures?.[0]?.error,
        }).catch(() => undefined);
      }
      return Response.json({ ok, result }, { status: ok ? 200 : 500 });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 300)
          : "Unknown fallback sweep error.";
      if (runId) {
        await finishCronRun(runId, { ok: false, detail: message }).catch(
          () => undefined,
        );
      }
      return Response.json(
        { ok: false, reason: "fallback_sweep_failed", error: message },
        { status: 500 },
      );
    }
  };
}

export const GET = createFallbackCronHandler();
