import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  revokeBrowserSession,
} from "@/lib/sylla/session";

export async function DELETE(request: NextRequest) {
  await revokeBrowserSession(request);
  return clearSessionCookie(NextResponse.json({ signedOut: true }));
}
