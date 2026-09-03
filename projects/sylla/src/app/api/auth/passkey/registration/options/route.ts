import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  attachPasskeyChallenge,
  registrationOptions,
} from "@/lib/sylla/passkeys";
import { resolveParticipant } from "@/lib/sylla/session";

export async function POST(request: NextRequest) {
  try {
    const { participant } = await resolveParticipant(request);
    const { options, userId } = await registrationOptions(participant.id);
    return attachPasskeyChallenge(NextResponse.json(options), {
      challenge: options.challenge,
      purpose: "registration",
      userId,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Passkey setup failed." },
      { status: 400 },
    );
  }
}
