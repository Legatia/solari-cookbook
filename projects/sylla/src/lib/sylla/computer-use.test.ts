import { describe, expect, it } from "vitest";

import { interactiveBrowserInputSchema } from "./computer-use";

describe("Sylla interactive computer use", () => {
  it("accepts a bounded host-driven browser action batch", () => {
    const parsed = interactiveBrowserInputSchema.parse({
      missionId: "65c0b649-a997-493f-a935-4b6b2e6dbf12",
      requestId: "browser-step-0001",
      actions: [
        { type: "fill", ref: "e2", value: "Tobias" },
        { type: "click", ref: "e4" },
      ],
    });
    expect(parsed.done).toBe(false);
    expect(parsed.actions).toHaveLength(2);
  });

  it("rejects unbounded or selector-shaped host input", () => {
    expect(
      interactiveBrowserInputSchema.safeParse({
        missionId: "65c0b649-a997-493f-a935-4b6b2e6dbf12",
        requestId: "browser-step-0002",
        actions: [{ type: "click", selector: "button.danger" }],
      }).success,
    ).toBe(false);
    expect(
      interactiveBrowserInputSchema.safeParse({
        missionId: "65c0b649-a997-493f-a935-4b6b2e6dbf12",
        requestId: "browser-step-0003",
        actions: Array.from({ length: 13 }, () => ({
          type: "wait",
          milliseconds: 100,
        })),
      }).success,
    ).toBe(false);
  });
});
