import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  issueRecoveryCodes,
  recoveryCodeStatus,
  redeemRecoveryCode,
  RecoveryError,
} from "@/lib/sylla/recovery";
import { consumeRateLimit, RateLimitError } from "@/lib/sylla/rate-limit";
import {
  attachSessionCookie,
  jsonWithSession,
  resolveParticipant,
} from "@/lib/sylla/session";

export function recoveryRateLimitIdentity(request: Pick<Request, "headers">) {
  // Proxies append comma-separated hops. Bound the value before hashing so a
  // caller cannot turn one small request into unbounded allocation work.
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim()
    .slice(0, 128);
  const agent = request.headers.get("user-agent")?.trim().slice(0, 256);
  return forwarded || agent || "anonymous";
}

/** How many codes are left. Never the codes themselves. */
export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(
      { recovery: await recoveryCodeStatus(participant.id) },
      newToken,
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recovery status failed." },
      { status: 400 },
    );
  }
}

/** Issue a fresh set. This is the only response that ever contains them. */
export async function POST(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(
      { recovery: await issueRecoveryCodes(participant.id) },
      newToken,
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not issue codes." },
      { status: 400 },
    );
  }
}

/**
 * Redeem a code for a session. Deliberately unauthenticated — this is the path
 * for someone who has lost every other way in.
 */
export async function PUT(request: NextRequest) {
  try {
    // The only unauthenticated way into an account, so it is metered. A code is
    // 12 Crockford base32 characters, which is far past guessing range, but the
    // limit also caps what a stolen partial list is worth.
    const caller = recoveryRateLimitIdentity(request);
    await consumeRateLimit(
      `recovery:redeem:${caller}`,
      10,
      10 * 60,
      "Too many recovery attempts from here. Wait a few minutes and try again.",
    );

    const { code } = (await request.json()) as { code?: unknown };
    if (typeof code !== "string") throw new RecoveryError("Enter a recovery code.");
    const session = await redeemRecoveryCode(code);
    return attachSessionCookie(
      NextResponse.json({ recovered: true }),
      session.token,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof RecoveryError || error instanceof RateLimitError
            ? error.message
            : "That recovery code is not usable.",
      },
      { status: error instanceof RateLimitError ? 429 : 401 },
    );
  }
}
