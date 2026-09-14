import { type NextRequest, NextResponse } from "next/server";

import { unsubscribeByToken } from "@/lib/sylla/notifications";

function answer(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function stop(token: string) {
  try {
    await unsubscribeByToken(token);
    return answer(
      "Stopped. Sylla will not email this address again. Your agent, and everything it knows, is untouched.",
      200,
    );
  } catch (error) {
    return answer(
      error instanceof Error ? error.message : "That link is not valid.",
      410,
    );
  }
}

export async function GET(request: NextRequest) {
  return stop(request.nextUrl.searchParams.get("token") ?? "");
}

/** Mail clients that honour one-click unsubscribe POST to the same address. */
export async function POST(request: NextRequest) {
  return stop(request.nextUrl.searchParams.get("token") ?? "");
}
