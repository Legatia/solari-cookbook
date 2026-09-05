import { describe, expect, it } from "vitest";

import { recoveryRateLimitIdentity } from "./route";

describe("recovery rate-limit identity", () => {
  it("uses the originating forwarded address rather than the whole proxy chain", () => {
    const request = new Request("https://sylla.example/api/auth/recovery", {
      headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.2" },
    });
    expect(recoveryRateLimitIdentity(request)).toBe("203.0.113.4");
  });

  it("bounds untrusted header input", () => {
    const request = new Request("https://sylla.example/api/auth/recovery", {
      headers: { "user-agent": "x".repeat(1_000) },
    });
    expect(recoveryRateLimitIdentity(request)).toHaveLength(256);
  });
});
