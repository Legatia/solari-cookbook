import {
  sweepFallbackRuns,
  type FallbackSweepResult,
} from "@/lib/sylla/runs";

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
  sweep: SweepFallbacks = sweepFallbackRuns,
) {
  return async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return Response.json(
        { ok: false, reason: "cron_not_configured" },
        { status: 503 },
      );
    }
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return Response.json(
        { ok: false, reason: "unauthorized" },
        { status: 401 },
      );
    }

    try {
      const result = await sweep({
        limit: configuredLimit(),
        workerId: "vercel-cron",
      });
      return Response.json(
        { ok: result.failed === 0, result },
        { status: result.failed === 0 ? 200 : 500 },
      );
    } catch (error) {
      return Response.json(
        {
          ok: false,
          reason: "fallback_sweep_failed",
          error:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Unknown fallback sweep error.",
        },
        { status: 500 },
      );
    }
  };
}

export const GET = createFallbackCronHandler();
