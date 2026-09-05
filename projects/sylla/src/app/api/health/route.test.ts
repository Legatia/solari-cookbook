import { describe, expect, it } from "vitest";

import {
  type CronHealth,
  publicCronHealth,
} from "@/lib/sylla/cron-health";

const healthySweep: CronHealth = {
  job: "fallback-sweep",
  configured: true,
  lastRunAt: "2026-09-05T12:00:00.000Z",
  lastFinishedAt: "2026-09-05T12:00:20.000Z",
  lastOk: true,
  lastDetail: "participant-sensitive provider error",
  stale: false,
  neverRun: false,
};

describe("public health payload", () => {
  it("does not expose stored scheduler diagnostic detail", () => {
    const payload = publicCronHealth(healthySweep);
    expect(payload.healthy).toBe(true);
    expect(payload.sweep).not.toHaveProperty("lastDetail");
    expect(JSON.stringify(payload)).not.toContain("participant-sensitive");
  });

  it("fails health immediately after a completed failed run", () => {
    expect(
      publicCronHealth({ ...healthySweep, lastOk: false }).healthy,
    ).toBe(false);
  });
});
