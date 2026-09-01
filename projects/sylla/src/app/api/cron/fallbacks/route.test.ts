import { afterEach, describe, expect, it, vi } from "vitest";

import { createFallbackCronHandler } from "./route";

const originalSecret = process.env.CRON_SECRET;
const originalLimit = process.env.SYLLA_FALLBACK_SWEEP_LIMIT;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
  if (originalLimit === undefined) delete process.env.SYLLA_FALLBACK_SWEEP_LIMIT;
  else process.env.SYLLA_FALLBACK_SWEEP_LIMIT = originalLimit;
});

describe("fallback cron route", () => {
  it("stays unavailable until a cron secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const sweep = vi.fn();
    const response = await createFallbackCronHandler(sweep)(
      new Request("http://localhost/api/cron/fallbacks"),
    );

    expect(response.status).toBe(503);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("rejects a request without the configured bearer secret", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    const sweep = vi.fn();
    const response = await createFallbackCronHandler(sweep)(
      new Request("http://localhost/api/cron/fallbacks"),
    );

    expect(response.status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("runs a bounded authenticated sweep", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    process.env.SYLLA_FALLBACK_SWEEP_LIMIT = "7";
    const sweep = vi.fn().mockResolvedValue({
      examined: 2,
      executed: 1,
      skipped: 1,
      failed: 0,
      failures: [],
    });
    const response = await createFallbackCronHandler(sweep)(
      new Request("http://localhost/api/cron/fallbacks", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(sweep).toHaveBeenCalledWith({
      limit: 7,
      workerId: "vercel-cron",
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: { executed: 1 },
    });
  });

  it("surfaces partial worker failures to scheduler monitoring", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    const sweep = vi.fn().mockResolvedValue({
      examined: 1,
      executed: 0,
      skipped: 0,
      failed: 1,
      failures: [{ agentRunId: "run-1", error: "provider unavailable" }],
    });
    const response = await createFallbackCronHandler(sweep)(
      new Request("http://localhost/api/cron/fallbacks", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });
});
