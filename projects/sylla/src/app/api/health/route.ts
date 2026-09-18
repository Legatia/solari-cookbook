import { NextResponse } from "next/server";

import { cronHealth, publicCronHealth } from "@/lib/sylla/cron-health";
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
  // This route is public. The helper intentionally omits stored provider
  // errors and other diagnostic detail.
  const publicSweep = publicCronHealth(sweep);
  const payload = {
    ...publicSweep,
    payments: { configured: stripeIsConfigured() },
  };
  return NextResponse.json(
    payload,
    {
      status: payload.healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
