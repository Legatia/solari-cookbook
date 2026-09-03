import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  clearDeviceCodeCookie,
  readDeviceCodeCookie,
  redeemDeviceLogin,
} from "@/lib/sylla/device-login";
import { attachSessionCookie } from "@/lib/sylla/session";

/**
 * Called only after the visitor has seen which agent approved the request and
 * explicitly continued. Polling deliberately does not sign anyone in.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await redeemDeviceLogin(readDeviceCodeCookie(request));
    const response = NextResponse.json({ signedIn: true });
    clearDeviceCodeCookie(response);
    return attachSessionCookie(response, session.token);
  } catch (error) {
    return clearDeviceCodeCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Sylla could not complete this sign-in.",
        },
        { status: 400 },
      ),
    );
  }
}
