import { describe, expect, it } from "vitest";

/**
 * The staleness rule is the whole point of the health endpoint, so it gets a
 * test that does not need a database.
 */
const STALE_AFTER_MS = 36 * 60 * 60 * 1_000;

function isStale(reference: Date, now = Date.now()) {
  return now - reference.getTime() > STALE_AFTER_MS;
}

describe("scheduler staleness", () => {
  it("treats a daily job as healthy well past its interval", () => {
    // A single missed firing should not page anyone.
    expect(isStale(new Date(Date.now() - 25 * 60 * 60 * 1_000))).toBe(false);
  });

  it("treats a job that has been quiet for a day and a half as stale", () => {
    // A cron that stopped produces silence, which looks exactly like a healthy
    // idle system. Elapsed time is the only signal that separates them.
    expect(isStale(new Date(Date.now() - 40 * 60 * 60 * 1_000))).toBe(true);
  });
});
