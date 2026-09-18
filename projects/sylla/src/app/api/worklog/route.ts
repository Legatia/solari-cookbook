import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";
import { buildWorkLog } from "@/lib/sylla/worklog";

/** Everything the agent did, and whether anyone was watching. */
export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const days = Number(request.nextUrl.searchParams.get("days") ?? 30);
    return jsonWithSession(
      {
        log: await buildWorkLog(participant.id, {
          days: Number.isSafeInteger(days) ? days : 30,
        }),
      },
      newToken,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not read the work log.",
      },
      { status: 400 },
    );
  }
}
