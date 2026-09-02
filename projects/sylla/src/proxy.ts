import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  demoAccessIsConfigured,
  hasDemoAccess,
} from "@/lib/demo-access";

const UNLOCKED_API_PATHS = ["/api/access", "/api/cron/fallbacks"];

export function proxy(request: NextRequest) {
  if (!demoAccessIsConfigured() || hasDemoAccess(request)) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (UNLOCKED_API_PATHS.some((path) => pathname.startsWith(path))) {
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
  matcher: ["/app/:path*", "/join/:path*", "/checkout/:path*", "/api/:path*", "/oauth/authorize"],
};
