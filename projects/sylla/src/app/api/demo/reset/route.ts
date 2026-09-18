import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  DemoResetError,
  participantIsDemo,
  resetDemoAgent,
} from "@/lib/sylla/demo-reset";
import { SESSION_COOKIE, resolveParticipant } from "@/lib/sylla/session";

/** Whether this agent may be reset at all, so the control stays hidden otherwise. */
export async function GET(request: NextRequest) {
  try {
    const { participant } = await resolveParticipant(request);
    return NextResponse.json({ demo: await participantIsDemo(participant.id) });
  } catch {
    return NextResponse.json({ demo: false });
  }
}

/**
 * Wipe the demo agent and drop the session.
 *
 * The cookie has to go with it: leaving it behind would point the browser at a
 * participant that no longer exists, and the next request would look like a
 * broken session rather than a fresh start.
 */
export async function POST(request: NextRequest) {
  try {
    const { participant } = await resolveParticipant(request);
    const result = await resetDemoAgent(participant.id);
    const response = NextResponse.json({ ...result, next: "/app" });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DemoResetError
            ? error.message
            : "That agent could not be reset.",
      },
      { status: error instanceof DemoResetError ? 403 : 400 },
    );
  }
}
