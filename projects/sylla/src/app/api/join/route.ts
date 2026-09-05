import { type NextRequest, NextResponse } from "next/server";

import { grantDemoAccess } from "@/lib/demo-access";
import {
  InvitationUnavailableError,
  redeemEventInvitation,
} from "@/lib/sylla/invitations";
import { consumeRateLimit, RateLimitError } from "@/lib/sylla/rate-limit";
import { attachSessionCookie } from "@/lib/sylla/session";

/**
 * Accepting an invitation.
 *
 * A POST rather than a GET because redeeming spends a seat and creates an
 * agent, and link previews fetch every URL shared in a chat. Looking at an
 * invitation and accepting it have to be different actions.
 *
 * Redeeming also lifts the demo password gate for this browser. The invitation
 * is already the stronger credential of the two — it expires, it is capped, it
 * is revocable, and it names one circle — so making a friend hold a shared
 * password as well would add ceremony without adding safety.
 */
export async function POST(request: NextRequest) {
  try {
    const caller =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("user-agent") ??
      "anonymous";
    await consumeRateLimit(
      `join:redeem:${caller}`,
      20,
      10 * 60,
      "Too many invitation attempts from here. Wait a few minutes and try again.",
    );

    const { credential } = (await request.json()) as { credential?: unknown };
    if (typeof credential !== "string") {
      throw new InvitationUnavailableError("Enter an invitation code.");
    }
    const redeemed = await redeemEventInvitation(credential);
    const response = NextResponse.json({ joined: true, next: "/app" });
    return grantDemoAccess(attachSessionCookie(response, redeemed.sessionToken));
  } catch (error) {
    const known =
      error instanceof InvitationUnavailableError || error instanceof RateLimitError;
    return NextResponse.json(
      { error: known ? error.message : "This invitation could not be opened." },
      { status: error instanceof RateLimitError ? 429 : 410 },
    );
  }
}
