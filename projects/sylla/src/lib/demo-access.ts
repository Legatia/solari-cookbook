import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

export const DEMO_ACCESS_COOKIE = "sylla_demo_access";
const DEMO_ACCESS_MAX_AGE = 60 * 60 * 24 * 7;

function accessConfiguration() {
  const password = process.env.SYLLA_DEMO_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  return password && secret ? { password, secret } : null;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function constantTimeEqual(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

function accessToken(configuration: { password: string; secret: string }) {
  return createHmac("sha256", configuration.secret)
    .update(`sylla-demo-access:v1:${configuration.password}`)
    .digest("base64url");
}

export function demoAccessIsConfigured() {
  return accessConfiguration() !== null;
}

export function verifyDemoPassword(candidate: string) {
  const configuration = accessConfiguration();
  return configuration
    ? constantTimeEqual(candidate, configuration.password)
    : false;
}

export function hasDemoAccess(request: NextRequest) {
  const configuration = accessConfiguration();
  const cookie = request.cookies.get(DEMO_ACCESS_COOKIE)?.value;
  return Boolean(
    configuration &&
      cookie &&
      constantTimeEqual(cookie, accessToken(configuration)),
  );
}

export function grantDemoAccess(response: NextResponse) {
  const configuration = accessConfiguration();
  if (!configuration) {
    throw new Error("The Sylla demo access gate is not configured.");
  }
  response.cookies.set(DEMO_ACCESS_COOKIE, accessToken(configuration), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DEMO_ACCESS_MAX_AGE,
    path: "/",
  });
  return response;
}

export function safeDemoReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/app";
  }
  try {
    const parsed = new URL(value, "https://sylla.invalid");
    return parsed.origin === "https://sylla.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/app";
  } catch {
    return "/app";
  }
}
