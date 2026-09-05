import { describe, expect, it } from "vitest";

import { cronRunIsStale } from "./cron-health";

describe("scheduler staleness", () => {
  it("treats a daily job as healthy well past its interval", () => {
    // A single missed firing should not page anyone.
    expect(
      cronRunIsStale({
        startedAt: new Date(Date.now() - 25 * 60 * 60 * 1_000),
        finishedAt: new Date(Date.now() - 25 * 60 * 60 * 1_000),
      }),
    ).toBe(false);
  });

  it("treats a job that has been quiet for a day and a half as stale", () => {
    // A cron that stopped produces silence, which looks exactly like a healthy
    // idle system. Elapsed time is the only signal that separates them.
    expect(
      cronRunIsStale({
        startedAt: new Date(Date.now() - 40 * 60 * 60 * 1_000),
        finishedAt: new Date(Date.now() - 40 * 60 * 60 * 1_000),
      }),
    ).toBe(true);
  });

  it("alerts quickly when a run starts but never finishes", () => {
    const now = Date.now();
    expect(
      cronRunIsStale(
        { startedAt: new Date(now - 11 * 60 * 1_000), finishedAt: null },
        now,
      ),
    ).toBe(true);
  });

  it("allows a recently started run to finish", () => {
    const now = Date.now();
    expect(
      cronRunIsStale(
        { startedAt: new Date(now - 2 * 60 * 1_000), finishedAt: null },
        now,
      ),
    ).toBe(false);
  });
});
