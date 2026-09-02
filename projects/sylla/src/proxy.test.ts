import { NextRequest, NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { grantDemoAccess } from "@/lib/demo-access";

import { config, proxy } from "./proxy";

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

describe("Sylla access proxy", () => {
  it("covers the app, protected APIs, and OAuth consent without intercepting MCP", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/app" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/session" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/oauth/authorize" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/mcp" })).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/.well-known/oauth-protected-resource/mcp",
      }),
    ).toBe(false);
  });

  it("redirects browser traffic and rejects API traffic before unlock", () => {
    const appResponse = proxy(
      new NextRequest("https://sylla.test/app?view=memory"),
    );
    expect(appResponse.headers.get("location")).toBe(
      "https://sylla.test/access?next=%2Fapp%3Fview%3Dmemory",
    );

    const apiResponse = proxy(new NextRequest("https://sylla.test/api/session"));
    expect(apiResponse.status).toBe(401);
  });

  it("allows a correctly signed access session", () => {
    const granted = grantDemoAccess(NextResponse.next());
    const cookie = granted.headers.get("set-cookie");
    const response = proxy(
      new NextRequest("https://sylla.test/app", {
        headers: cookie ? { cookie } : undefined,
      }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
