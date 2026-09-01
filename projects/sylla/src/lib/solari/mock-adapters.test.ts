import { describe, expect, it } from "vitest";

import { createSolariAdapters } from "./factory";

describe("mock Solari adapters", () => {
  it("runs the Browser, Desktop, and Sandbox contract in mock mode", async () => {
    const adapters = await createSolariAdapters({
      INTEGRATION_MODE: "mock",
      SOLARI_BASE_URL: "https://api.getsolari.com",
    });

    const research = await adapters.browser.research({
      participantRef: "participant-a",
      sources: [
        {
          id: "source-a",
          url: "https://example.com/profile",
          label: "Example profile",
        },
      ],
    });

    expect(research.provider).toBe("mock");
    expect(research.evidence).toHaveLength(1);

    const workspace = await adapters.desktop.provision({
      participantRef: "participant-a",
      agentName: "Mira",
      eventName: "Thursday Assembly",
      currentTask: "Reviewing approved sources",
      artifactCount: 1,
      memoryCount: 0,
      observations: [],
    });

    expect(workspace.status).toBe("ready");
    await adapters.desktop.pause(workspace.sessionId);
    await adapters.desktop.destroy(workspace.sessionId);

    const evaluation = await adapters.sandbox.evaluate({
      direction: "alice-to-bob",
      participantObservations: [
        { id: "alice-1", claim: "Prefers thoughtful small-group conversation" },
      ],
      candidateObservations: [
        { id: "bob-1", claim: "Organizes neighborhood garden projects" },
      ],
    });

    expect(evaluation.recommend).toBe(true);
    expect(evaluation.rationale[0].supportingObservationIds).toEqual([
      "alice-1",
      "bob-1",
    ]);
  });

  it("requires a Solari key in live mode", async () => {
    await expect(
      createSolariAdapters({
        INTEGRATION_MODE: "live",
        SOLARI_BASE_URL: "https://api.getsolari.com",
      }),
    ).rejects.toThrow("SOLARI_API_KEY");
  });
});
