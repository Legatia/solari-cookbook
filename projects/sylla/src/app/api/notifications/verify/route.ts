import { type NextRequest, NextResponse } from "next/server";

import { confirmEmailVerification } from "@/lib/sylla/notifications";

/** Opened from a mail client, so it answers in prose rather than JSON. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    const { address } = await confirmEmailVerification(token);
    return new NextResponse(
      `${address} is confirmed. Sylla will tell you when your agent finishes something or when something needs you — never what it was. That stays in Sylla.`,
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "That link is not valid.",
      { status: 410, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
}
