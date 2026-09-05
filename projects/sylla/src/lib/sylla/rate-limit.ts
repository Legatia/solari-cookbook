import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import { authRateLimits } from "@/db/schema";

/**
 * A counter per key, per rolling window.
 *
 * Shared by every unauthenticated entry point, because those are the only ones
 * an attacker can hammer without first holding something of the participant's.
 * The window resets in SQL rather than in application code so two concurrent
 * requests cannot each decide the window has expired.
 */
export class RateLimitError extends Error {}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message: string,
  wrap: (message: string) => Error = (text) => new RateLimitError(text),
) {
  const [row] = await getDatabase()
    .insert(authRateLimits)
    .values({ keyHash: createHash("sha256").update(key).digest("hex") })
    .onConflictDoUpdate({
      target: authRateLimits.keyHash,
      set: {
        attempts: sql`case when ${authRateLimits.windowStartedAt} < now() - make_interval(secs => ${windowSeconds}) then 1 else ${authRateLimits.attempts} + 1 end`,
        windowStartedAt: sql`case when ${authRateLimits.windowStartedAt} < now() - make_interval(secs => ${windowSeconds}) then now() else ${authRateLimits.windowStartedAt} end`,
      },
    })
    .returning();
  if (row && row.attempts > limit) throw wrap(message);
}
