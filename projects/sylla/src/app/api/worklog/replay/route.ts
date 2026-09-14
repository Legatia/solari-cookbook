import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db";
import { agentRuns } from "@/db/schema";
import { createSolariAdapters } from "@/lib/solari";
import { resolveParticipant } from "@/lib/sylla/session";

/**
 * A watchable replay of one run.
 *
 * Minted here rather than stored, because the provider issues a presigned URL
 * with its own expiry. Asking for it only when somebody presses watch also
 * means the work log costs nothing to read.
 *
 * Scoped to the caller's own run: a session id is not a capability, and nobody
 * gets to watch a recording by knowing one.
 */
export async function GET(request: NextRequest) {
  try {
    const { participant } = await resolveParticipant(request);
    const runId = request.nextUrl.searchParams.get("runId") ?? "";

    const [run] = await getDatabase()
      .select({ replaySessionId: agentRuns.replaySessionId })
      .from(agentRuns)
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.participantId, participant.id)))
      .limit(1);
    if (!run?.replaySessionId) {
      return NextResponse.json(
        { error: "There is no recording for that piece of work." },
        { status: 404 },
      );
    }

    const solari = await createSolariAdapters();
    const replay = await solari.browser.replayUrl(run.replaySessionId);
    if (!replay) {
      // Distinguished from "no recording": one is worth trying again shortly,
      // the other never will be.
      return NextResponse.json(
        {
          pending: true,
          message:
            "That recording is still being processed, or has passed your plan's replay retention.",
        },
        { status: 202 },
      );
    }
    return NextResponse.json(replay, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch that replay." },
      { status: 400 },
    );
  }
}
