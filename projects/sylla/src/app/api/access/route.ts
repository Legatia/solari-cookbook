import { NextResponse } from "next/server";

import {
  grantDemoAccess,
  safeDemoReturnPath,
  verifyDemoPassword,
} from "@/lib/demo-access";

export async function POST(request: Request) {
  const form = await request.formData();
  const next = safeDemoReturnPath(form.get("next"));
  if (!verifyDemoPassword(String(form.get("password") ?? ""))) {
    const retry = new URL("/access", request.url);
    retry.searchParams.set("error", "invalid");
    retry.searchParams.set("next", next);
    return NextResponse.redirect(retry, 303);
  }

  return grantDemoAccess(
    NextResponse.redirect(new URL(next, request.url), 303),
  );
}
