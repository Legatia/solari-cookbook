import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  demoAccessIsConfigured,
  hasDemoAccess,
} from "@/lib/demo-access";

// Health and the Stripe webhook are machine endpoints: an uptime check and
// Stripe cannot type a demo password. Joining is unlocked because the
// invitation itself is the credential, and an invited friend should not need
// to be handed a second shared secret to use the one they were given.
const UNLOCKED_API_PATHS = [
  "/api/access",
  "/api/cron/fallbacks",
  "/api/health",
  "/api/billing/webhook",
  "/api/join",
];

export function proxy(request: NextRequest) {
  if (!demoAccessIsConfigured() || hasDemoAccess(request)) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (
    UNLOCKED_API_PATHS.some((path) => pathname.startsWith(path)) ||
    pathname === "/join" ||
    pathname.startsWith("/join/")
  ) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return Response.json(
      { error: "Enter the Sylla demo password before using this API." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const accessUrl = new URL("/access", request.url);
  accessUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(accessUrl);
}

export const config = {
  matcher: ["/app/:path*", "/login/:path*", "/join/:path*", "/checkout/:path*", "/api/:path*", "/oauth/authorize"],
};
