import { type NextRequest, NextResponse } from "next/server";

import {
  InvitationUnavailableError,
  redeemEventInvitation,
} from "@/lib/sylla/invitations";
import { attachSessionCookie } from "@/lib/sylla/session";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/join/[token]">,
) {
  try {
    const { token } = await context.params;
    const redeemed = await redeemEventInvitation(token);
    return attachSessionCookie(
      NextResponse.redirect(new URL("/", request.url), 303),
      redeemed.sessionToken,
    );
  } catch (error) {
    const message =
      error instanceof InvitationUnavailableError
        ? error.message
        : "This invitation could not be opened.";
    return new NextResponse(message, {
      status: 410,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
