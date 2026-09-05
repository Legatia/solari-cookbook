import { describe, expect, it } from "vitest";

import type { MissionView } from "./missions";
import {
  interactiveBrowserInputSchema,
  requireLoginHandoffCheckpoint,
} from "./computer-use";

const loginMission: MissionView = {
  id: "65c0b649-a997-493f-a935-4b6b2e6dbf12",
  objective: "Post the approved update",
  requestedOutcome: null,
  capability: "operate_web_account",
  status: "waiting_for_user",
  riskLevel: "external_action",
  approvalRequired: true,
  approvedAt: "2026-09-05T10:00:00.000Z",
  constraints: {
    sourceUrls: [{ url: "https://example.com/account" }],
    maxCredits: 100,
    backgroundContinuationAllowed: false,
  },
  resourcePlan: {
    primary: "browser",
    supporting: ["desktop"],
    reason: "The task needs a signed-in website.",
  },
  plan: [],
  steps: [],
  result: {
    observation: {
      url: "https://example.com/login",
      humanCheckpoint: {
        required: true,
        reason: "A password is required.",
      },
    },
  },
  lastError: null,
  nextAction: "Wait for login.",
  conversationCue: "Hand control to the participant.",
  createdAt: "2026-09-05T09:55:00.000Z",
  updatedAt: "2026-09-05T10:00:00.000Z",
  completedAt: null,
};

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

  it("allows a login handoff only at this approved mission's credential checkpoint", () => {
    expect(requireLoginHandoffCheckpoint(loginMission)).toEqual({
      observedUrl: "https://example.com/login",
      reason: "A password is required.",
    });
    expect(() =>
      requireLoginHandoffCheckpoint({
        ...loginMission,
        result: {
          observation: {
            url: "https://example.com/profile",
            humanCheckpoint: null,
          },
        },
      }),
    ).toThrow(/only after this mission reaches/);
  });

  it("refuses an arbitrary or unapproved mission id as a login capability", () => {
    expect(() =>
      requireLoginHandoffCheckpoint({
        ...loginMission,
        capability: "research_public_topic",
      }),
    ).toThrow(/does not authorize interactive web actions/);
    expect(() =>
      requireLoginHandoffCheckpoint({ ...loginMission, approvedAt: null }),
    ).toThrow(/has not approved/);
  });
});
