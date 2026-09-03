import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  DeviceLoginError,
  describeRequestingDevice,
  formatUserCode,
  normalizeUserCode,
} from "./device-login";

function requestWith(headers: Record<string, string>) {
  return new NextRequest("https://sylla.example/api/auth/device", { headers });
}

describe("device login codes", () => {
  it("formats a raw code into the spoken form", () => {
    expect(formatUserCode("M1RAK7QF")).toBe("M1RA-K7QF");
  });

  it("accepts the code as a participant is likely to say or type it", () => {
    expect(normalizeUserCode("mira-k7qf")).toBe("M1RAK7QF");
    expect(normalizeUserCode(" M I R A K 7 Q F ")).toBe("M1RAK7QF");
  });

  it("resolves characters Crockford base32 omits", () => {
    // A participant reading aloud says "O" and "I"; storage only ever holds 0 and 1.
    expect(normalizeUserCode("OIL0K7QF")).toBe("0110K7QF");
  });

  it("rejects a code of the wrong length", () => {
    expect(() => normalizeUserCode("K7QF")).toThrow(DeviceLoginError);
    expect(() => normalizeUserCode("M1RAK7QFEXTRA")).toThrow(DeviceLoginError);
  });
});

describe("requesting device description", () => {
  it("derives the label from headers rather than trusting the caller", () => {
    const device = describeRequestingDevice(
      requestWith({
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "x-vercel-ip-city": "Berlin",
        "x-vercel-ip-country": "DE",
        "x-forwarded-for": "203.0.113.7, 70.41.3.18",
      }),
    );
    expect(device.deviceLabel).toBe("Safari on macOS");
    expect(device.requestLocation).toBe("Berlin, DE");
    expect(device.rateLimitKey).toBe("203.0.113.7");
  });

  it("stores only a hash of the client address", () => {
    const device = describeRequestingDevice(
      requestWith({ "x-forwarded-for": "203.0.113.7" }),
    );
    expect(device.requestIpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(device.requestIpHash).not.toContain("203.0.113.7");
  });

  it("degrades honestly when a browser sends nothing useful", () => {
    const device = describeRequestingDevice(requestWith({}));
    expect(device.deviceLabel).toBe("an unrecognized browser on an unrecognized device");
    expect(device.requestLocation).toBeNull();
    expect(device.requestUserAgent).toBeNull();
  });

  it("prefers Chrome's own marker over the Safari token it also sends", () => {
    const device = describeRequestingDevice(
      requestWith({
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      }),
    );
    expect(device.deviceLabel).toBe("Chrome on Windows");
  });
});
