import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  authenticatePasskey,
  clearPasskeyChallenge,
  readPasskeyChallenge,
} from "@/lib/sylla/passkeys";
import {
  attachSessionCookie,
  createUserSession,
} from "@/lib/sylla/session";

export async function POST(request: NextRequest) {
  try {
    const challenge = readPasskeyChallenge(request, "authentication");
    const authenticated = await authenticatePasskey({
      challenge: challenge.challenge,
      response: (await request.json()) as AuthenticationResponseJSON,
    });
    const session = await createUserSession(authenticated.userId);
    const response = NextResponse.json({ verified: true });
    clearPasskeyChallenge(response);
    return attachSessionCookie(response, session.token);
  } catch (error) {
    return clearPasskeyChallenge(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "Passkey sign-in failed." },
        { status: 401 },
      ),
    );
  }
}
