import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  DeviceLoginRateLimitError,
  readDeviceCodeCookie,
  readDeviceLoginStatus,
} from "@/lib/sylla/device-login";

export async function GET(request: NextRequest) {
  try {
    const status = await readDeviceLoginStatus(readDeviceCodeCookie(request));
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sylla could not check this sign-in request.",
      },
      { status: error instanceof DeviceLoginRateLimitError ? 429 : 400 },
    );
  }
}
