import { NextResponse } from "next/server";

import { cronHealth } from "@/lib/sylla/cron-health";
import { stripeIsConfigured } from "@/lib/sylla/stripe";

/**
 * A single endpoint an uptime check can watch.
 *
 * Unauthenticated on purpose, and deliberately says nothing about any
 * participant: it reports whether the machinery is running, not what it did.
 * Returns 503 when the sweep has gone quiet, so a monitor alerts on silence
 * rather than requiring someone to remember to look.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const sweep = await cronHealth("fallback-sweep");
  const healthy = sweep.configured && !sweep.stale;
  return NextResponse.json(
    {
      healthy,
      sweep,
      payments: { configured: stripeIsConfigured() },
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
