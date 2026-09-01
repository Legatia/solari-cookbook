import { describe, expect, it } from "vitest";

import { assertPublicHttpUrl, isPrivateAddress } from "./url-policy";

describe("Solari source URL policy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fd00::1",
  ])("recognizes private address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    "http://localhost:3000",
    "http://project.local",
    "http://127.0.0.1/admin",
    "file:///etc/passwd",
  ])("rejects unsafe source %s", (source) => {
    expect(() => assertPublicHttpUrl(source)).toThrow();
  });

  it("accepts a public HTTPS source", () => {
    expect(assertPublicHttpUrl("https://example.com/profile").hostname).toBe(
      "example.com",
    );
  });
});
