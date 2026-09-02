import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEMO_ACCESS_COOKIE,
  grantDemoAccess,
  hasDemoAccess,
  safeDemoReturnPath,
  verifyDemoPassword,
} from "./demo-access";

const previousPassword = process.env.SYLLA_DEMO_PASSWORD;
const previousSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.SYLLA_DEMO_PASSWORD = "test-password";
  process.env.AUTH_SECRET = "test-auth-secret-with-enough-entropy";
});

afterEach(() => {
  if (previousPassword === undefined) delete process.env.SYLLA_DEMO_PASSWORD;
  else process.env.SYLLA_DEMO_PASSWORD = previousPassword;
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
});

describe("Sylla demo access", () => {
  it("grants a signed HttpOnly cookie only for the configured password", () => {
    expect(verifyDemoPassword("wrong-password")).toBe(false);
    expect(verifyDemoPassword("test-password")).toBe(true);

    const response = grantDemoAccess(NextResponse.next());
    const cookie = response.cookies.get(DEMO_ACCESS_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax" });
    const request = new NextRequest("https://sylla.test/app", {
      headers: { cookie: `${DEMO_ACCESS_COOKIE}=${cookie?.value}` },
    });
    expect(hasDemoAccess(request)).toBe(true);
  });

  it("rejects forged access cookies and external return URLs", () => {
    const request = new NextRequest("https://sylla.test/app", {
      headers: { cookie: `${DEMO_ACCESS_COOKIE}=forged` },
    });
    expect(hasDemoAccess(request)).toBe(false);
    expect(safeDemoReturnPath("https://attacker.test/steal")).toBe("/app");
    expect(safeDemoReturnPath("//attacker.test/steal")).toBe("/app");
    expect(safeDemoReturnPath("/oauth/authorize?client_id=one")).toBe(
      "/oauth/authorize?client_id=one",
    );
  });
});
