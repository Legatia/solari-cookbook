import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import {
  attachPasskeyChallenge,
  readPasskeyChallenge,
} from "./passkeys";

const originalSecret = process.env.AUTH_SECRET;
const originalBaseUrl = process.env.APP_BASE_URL;

function requestFrom(response: NextResponse) {
  const cookie = response.cookies.get("sylla_passkey_challenge");
  return new NextRequest("https://sylla.example/api/auth/passkey/test", {
    headers: { cookie: `${cookie?.name}=${cookie?.value}` },
  });
}

describe("passkey challenges", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-passkey-secret-that-is-long-enough";
    process.env.APP_BASE_URL = "https://sylla.example";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
    if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = originalBaseUrl;
  });

  it("round-trips a signed, purpose-bound challenge", () => {
    const response = attachPasskeyChallenge(NextResponse.json({}), {
      challenge: "challenge-123",
      purpose: "registration",
      userId: "user-123",
    });
    expect(readPasskeyChallenge(requestFrom(response), "registration")).toMatchObject({
      challenge: "challenge-123",
      purpose: "registration",
      userId: "user-123",
    });
    expect(() =>
      readPasskeyChallenge(requestFrom(response), "authentication"),
    ).toThrow("missing or expired");
  });

  it("rejects a tampered challenge cookie", () => {
    const response = attachPasskeyChallenge(NextResponse.json({}), {
      challenge: "challenge-123",
      purpose: "authentication",
    });
    const cookie = response.cookies.get("sylla_passkey_challenge");
    const tamperedValue = cookie?.value.replace(/.$/, (last) =>
      last === "x" ? "y" : "x",
    );
    const request = new NextRequest(
      "https://sylla.example/api/auth/passkey/test",
      {
        headers: {
          cookie: `${cookie?.name}=${tamperedValue}`,
        },
      },
    );
    expect(() => readPasskeyChallenge(request, "authentication")).toThrow(
      "invalid",
    );
  });
});
