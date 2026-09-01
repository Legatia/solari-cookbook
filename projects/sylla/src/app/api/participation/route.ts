import type { NextRequest } from "next/server";

import {
  acceptParticipationConsent,
  withdrawParticipation,
} from "@/lib/sylla/participation";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

export async function POST(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);
  try {
    const state = await acceptParticipationConsent(
      participant.id,
      await request.json(),
    );
    return jsonWithSession({ state }, newToken);
  } catch (error) {
    return jsonWithSession(
      { error: error instanceof Error ? error.message : "Consent could not be saved." },
      newToken,
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);
  try {
    const state = await withdrawParticipation(participant.id);
    return jsonWithSession({ state }, newToken);
  } catch (error) {
    return jsonWithSession(
      { error: error instanceof Error ? error.message : "Withdrawal could not be completed." },
      newToken,
      { status: 400 },
    );
  }
}
