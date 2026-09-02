import { describe, expect, it } from "vitest";

import {
  buildMissionPlan,
  classifyMission,
  classifyMissionRisk,
  startMissionSchema,
} from "./missions";

describe("Sylla mission routing", () => {
  it("selects product capabilities from human objectives", () => {
    expect(classifyMission("Test this GitHub repository for me")).toBe(
      "test_software",
    );
    expect(classifyMission("Find someone I may genuinely want to meet")).toBe(
      "find_private_introduction",
    );
    expect(classifyMission("Compare these three pottery classes")).toBe(
      "compare_options",
    );
    expect(classifyMission("Open my persistent agent workspace")).toBe(
      "maintain_personal_workspace",
    );
  });

  it("raises approval requirements from consequences rather than infrastructure", () => {
    expect(classifyMissionRisk("Research these public pages")).toBe("observe");
    expect(classifyMissionRisk("Draft a note for the organizer")).toBe("prepare");
    expect(classifyMissionRisk("Send the note to the organizer")).toBe(
      "external_action",
    );
    expect(classifyMissionRisk("Buy the ticket for me")).toBe("sensitive");
    expect(classifyMissionRisk("Delete my account")).toBe("destructive");
  });

  it("maps repository work to Sandbox without asking the participant", () => {
    const route = buildMissionPlan("test_software", "prepare");
    expect(route.resourcePlan.primary).toBe("sandbox");
    expect(route.plan.some((step) => step.resource === "sandbox")).toBe(true);
  });

  it("does not mistake words inside nouns for consequential actions", () => {
    const objective = "Research what the Solari cookbook provides to builders.";
    expect(classifyMission(objective)).toBe("research_public_topic");
    expect(classifyMissionRisk(objective)).toBe("observe");
  });

  it("bounds mission scope and applies safe defaults", () => {
    const parsed = startMissionSchema.parse({
      requestId: "mission-request-001",
      objective: "Research this event for me.",
      sources: [{ url: "https://example.com/event" }],
    });
    expect(parsed.maxCredits).toBe(100);
    expect(parsed.backgroundContinuationAllowed).toBe(false);
    expect(parsed.sources).toHaveLength(1);
  });
});
