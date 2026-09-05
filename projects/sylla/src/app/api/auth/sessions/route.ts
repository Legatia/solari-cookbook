import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  jsonWithSession,
  listUserSessions,
  resolveParticipant,
  revokeUserSession,
  SESSION_COOKIE,
} from "@/lib/sylla/session";

/** Every browser currently signed in to this agent. */
export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const current = request.cookies.get(SESSION_COOKIE)?.value;
    return jsonWithSession(
      { sessions: await listUserSessions(participant.id, current) },
      newToken,
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list sessions." },
      { status: 400 },
    );
  }
}

/** Sign one other browser out, immediately. */
export async function DELETE(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const { sessionId } = (await request.json()) as { sessionId?: unknown };
    if (typeof sessionId !== "string") {
      throw new Error("Name the session to revoke.");
    }
    const current = request.cookies.get(SESSION_COOKIE)?.value;
    const result = await revokeUserSession(participant.id, sessionId, current);
    const response = jsonWithSession({ result }, newToken);
    return result.wasCurrent ? clearSessionCookie(response) : response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not revoke that session." },
      { status: 400 },
    );
  }
}
