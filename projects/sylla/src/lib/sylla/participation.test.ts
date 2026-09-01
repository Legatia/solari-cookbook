import { describe, expect, it } from "vitest";

import {
  PARTICIPATION_POLICY_VERSION,
  participationConsentSchema,
} from "@/lib/sylla/participation";

const valid = {
  displayName: "Tobias",
  policyVersion: PARTICIPATION_POLICY_VERSION,
  ageConfirmed: true,
  publicSourceResearch: true,
  privateMemoryStorage: true,
  matchmaking: true,
  hostDataBoundary: true,
  backgroundContinuation: false,
  availability: [
    {
      startsAt: "2026-09-10T18:00:00.000Z",
      endsAt: "2026-09-10T20:00:00.000Z",
      timezone: "Europe/Warsaw",
    },
  ],
};

describe("participation consent", () => {
  it("requires every material permission explicitly", () => {
    expect(participationConsentSchema.safeParse(valid).success).toBe(true);
    expect(
      participationConsentSchema.safeParse({
        ...valid,
        matchmaking: false,
      }).success,
    ).toBe(false);
  });

  it("rejects an inverted availability window", () => {
    expect(
      participationConsentSchema.safeParse({
        ...valid,
        availability: [
          {
            ...valid.availability[0],
            endsAt: "2026-09-10T17:00:00.000Z",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
