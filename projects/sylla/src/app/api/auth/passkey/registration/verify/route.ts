import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  clearPasskeyChallenge,
  readPasskeyChallenge,
  registerPasskey,
} from "@/lib/sylla/passkeys";
import { resolveParticipant } from "@/lib/sylla/session";

export async function POST(request: NextRequest) {
  try {
    const challenge = readPasskeyChallenge(request, "registration");
    if (!challenge.userId) throw new Error("The passkey account is missing.");
    const { participant } = await resolveParticipant(request);
    const status = await registerPasskey({
      participantId: participant.id,
      userId: challenge.userId,
      challenge: challenge.challenge,
      response: (await request.json()) as RegistrationResponseJSON,
    });
    return clearPasskeyChallenge(NextResponse.json({ verified: true, status }));
  } catch (error) {
    return clearPasskeyChallenge(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "Passkey setup failed." },
        { status: 400 },
      ),
    );
  }
}
