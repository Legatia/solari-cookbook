import type { NextRequest } from "next/server";

import {
  getParticipantConnectionSummary,
  listParticipantConnections,
  revokeParticipantConnection,
  revokeParticipantOAuthTokens,
} from "@/lib/mcp/first-party-oauth";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(
      {
        connection: await getParticipantConnectionSummary(participant.id),
        clients: await listParticipantConnections(participant.id),
      },
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
    // A named client disconnects just that one; no name still disconnects
    // everything, which is what the panic button should do.
    const body = (await request.json().catch(() => ({}))) as { clientId?: unknown };
    if (typeof body.clientId === "string" && body.clientId) {
      await revokeParticipantConnection(participant.id, body.clientId);
    } else {
      await revokeParticipantOAuthTokens(participant.id);
    }
    return jsonWithSession(
      {
        connection: await getParticipantConnectionSummary(participant.id),
        clients: await listParticipantConnections(participant.id),
      },
      newToken,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Disconnect failed." },
      { status: 500 },
    );
  }
}
