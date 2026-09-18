import { describe, expect, it } from "vitest";

import { mapWithConcurrency, sweepConcurrency } from "./concurrency";

/** Resolves when told to, so the test controls exactly when work finishes. */
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("bounded concurrency", () => {
  it("never runs more at once than the bound allows", async () => {
    let inFlight = 0;
    let peak = 0;
    const gates = Array.from({ length: 12 }, deferred);

    const work = mapWithConcurrency([...gates.keys()], 4, async (index) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await gates[index].promise;
      inFlight -= 1;
      return index;
    });

    // Let everything that can start, start, then check nothing sneaked past.
    await Promise.resolve();
    expect(peak).toBe(4);
    for (const gate of gates) gate.release();
    expect(await work).toEqual([...gates.keys()]);
    expect(peak).toBe(4);
  });

  it("keeps every worker busy when one item is slow", async () => {
    const slow = deferred();
    const order: number[] = [];

    const work = mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (index) => {
      if (index === 0) await slow.promise;
      order.push(index);
      return index;
    });

    // One stalled item must not hold the queue behind it: the other worker
    // should have drained everything else before it is released.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual([1, 2, 3, 4, 5]);
    slow.release();
    await work;
    expect(order).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it("preserves result order regardless of finishing order", async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms / 10));
      return ms;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it("reads the bound from configuration, with a ceiling", () => {
    const key = "SYLLA_TEST_SWEEP_CONCURRENCY";
    delete process.env[key];
    expect(sweepConcurrency(key, 4)).toBe(4);
    process.env[key] = "9";
    expect(sweepConcurrency(key, 4)).toBe(9);
    // A plan is never so large that one sweep should take all of it.
    process.env[key] = "999";
    expect(sweepConcurrency(key, 4)).toBe(16);
    process.env[key] = "nonsense";
    expect(sweepConcurrency(key, 4)).toBe(4);
    delete process.env[key];
  });
});
