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

    const computer = await adapters.browserComputer.operate({
      participantRef: "participant-a",
      startUrl: "https://example.com/account",
      allowedOrigins: ["https://example.com"],
      actions: [{ type: "click", ref: "e1" }],
    });
    expect(computer.provider).toBe("mock");
    expect(computer.profileSaved).toBe(true);
    expect(computer.actionsCompleted).toBe(1);

    const volumeId = await adapters.desktop.createVolume("participant-a");
    const workspace = await adapters.desktop.provision({
      participantRef: "participant-a",
      agentName: "Mira",
      eventName: "Thursday Assembly",
      currentTask: "Reviewing approved sources",
      artifactCount: 1,
      memoryCount: 0,
      observations: [],
    }, {
      volumeId,
    });

    expect(workspace.status).toBe("ready");
    expect(workspace.volumeId).toBe(volumeId);
    expect(workspace.snapshotId).toMatch(/^snapshot-mock-/);
    await expect(
      adapters.desktop.checkpoint(workspace.sessionId),
    ).resolves.toMatch(/^snapshot-mock-/);
    await adapters.desktop.pause(workspace.sessionId);
    const resumed = await adapters.desktop.provision(
      {
        participantRef: "participant-a",
        agentName: "Mira",
        eventName: "Thursday Assembly",
        currentTask: "Reviewing approved sources",
        artifactCount: 1,
        memoryCount: 0,
        observations: [],
      },
      { sessionId: workspace.sessionId, volumeId },
    );
    expect(resumed.sessionId).toBe(workspace.sessionId);
    await adapters.desktop.destroy(workspace.sessionId);
    const reconstructed = await adapters.desktop.provision(
      {
        participantRef: "participant-a",
        agentName: "Mira",
        eventName: "Thursday Assembly",
        currentTask: "Reconstructing from durable state",
        artifactCount: 1,
        memoryCount: 0,
        observations: [],
      },
      { sessionId: workspace.sessionId, volumeId },
    );
    expect(reconstructed.sessionId).not.toBe(workspace.sessionId);
    expect(reconstructed.volumeId).toBe(volumeId);
    await adapters.desktop.destroy(reconstructed.sessionId);
    await adapters.desktop.deleteVolume(volumeId);

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

    const repositoryTask = await adapters.sandboxTask.runRepositoryTask({
      participantRef: "participant-a",
      repositoryUrl: "https://github.com/example/project",
      objective: "Run the project's tests.",
    });
    expect(repositoryTask.provider).toBe("mock");
    expect(repositoryTask.exitCode).toBe(0);
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
