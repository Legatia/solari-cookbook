import type { NextRequest } from "next/server";

import {
  getParticipantConnectionSummary,
  revokeParticipantOAuthTokens,
} from "@/lib/mcp/first-party-oauth";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(
      { connection: await getParticipantConnectionSummary(participant.id) },
      newToken,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Connection state failed." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    await revokeParticipantOAuthTokens(participant.id);
    return jsonWithSession(
      { connection: await getParticipantConnectionSummary(participant.id) },
      newToken,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Disconnect failed." },
      { status: 500 },
    );
  }
}
