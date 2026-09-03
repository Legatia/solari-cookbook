import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  attachDeviceCodeCookie,
  createDeviceLoginRequest,
  DeviceLoginRateLimitError,
} from "@/lib/sylla/device-login";

export async function POST(request: NextRequest) {
  try {
    const created = await createDeviceLoginRequest(request);
    // The device code stays in an HttpOnly cookie: only the browser that asked
    // can finish the sign-in, and page scripts never see the credential.
    return attachDeviceCodeCookie(
      NextResponse.json({
        userCode: created.userCode,
        expiresAt: created.expiresAt,
        pollIntervalSeconds: created.pollIntervalSeconds,
      }),
      created.deviceCode,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sylla could not start a sign-in request.",
      },
      { status: error instanceof DeviceLoginRateLimitError ? 429 : 400 },
    );
  }
}
