import { NextResponse } from "next/server";

import {
  attachPasskeyChallenge,
  authenticationOptions,
} from "@/lib/sylla/passkeys";

export async function POST() {
  try {
    const options = await authenticationOptions();
    return attachPasskeyChallenge(NextResponse.json(options), {
      challenge: options.challenge,
      purpose: "authentication",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Passkey sign-in failed." },
      { status: 400 },
    );
  }
}
