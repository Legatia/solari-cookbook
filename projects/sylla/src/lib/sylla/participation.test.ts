import { describe, expect, it } from "vitest";

import {
  conversationalSetupSchema,
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
  it("keeps introductions optional without weakening core consent", () => {
    expect(participationConsentSchema.safeParse(valid).success).toBe(true);
    expect(
      participationConsentSchema.safeParse({
        ...valid,
        matchmaking: false,
        availability: [],
      }).success,
    ).toBe(true);
    expect(
      participationConsentSchema.safeParse({
        ...valid,
        matchmaking: true,
        availability: [],
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

  it("accepts a complete conversational setup and requires an agent identity", () => {
    expect(
      conversationalSetupSchema.safeParse({
        ...valid,
        agentName: "Mira",
        focus: "Help me build more durable human relationships.",
      }).success,
    ).toBe(true);
    expect(
      conversationalSetupSchema.safeParse({
        ...valid,
        focus: "Help me build more durable human relationships.",
      }).success,
    ).toBe(false);
  });
});
