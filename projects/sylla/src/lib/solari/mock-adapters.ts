import { randomUUID } from "node:crypto";

import {
  directionalEvaluationRequestSchema,
  directionalEvaluationSchema,
  browserComputerRequestSchema,
  browserComputerResultSchema,
  researchRequestSchema,
  researchResultSchema,
  repositoryTaskRequestSchema,
  repositoryTaskResultSchema,
  workspaceManifestSchema,
  workspaceResultSchema,
  type BrowserResearchAdapter,
  type BrowserComputerAdapter,
  type DesktopWorkspaceAdapter,
  type SandboxEvaluationAdapter,
  type SandboxTaskAdapter,
} from "./contracts";
import { assertPublicHttpUrl } from "./url-policy";

export class MockBrowserResearchAdapter implements BrowserResearchAdapter {
  async research(input: unknown) {
    const request = researchRequestSchema.parse(input);
    const observedAt = new Date().toISOString();

    const evidence = request.sources.map((source) => {
      const url = assertPublicHttpUrl(source.url);

      return {
        sourceId: source.id,
        sourceUrl: url.toString(),
        sourceTitle: source.label ?? url.hostname,
        excerpt: `Mock evidence collected from ${url.hostname}.`,
        observedAt,
      };
    });

    return researchResultSchema.parse({
      provider: "mock",
      runReference: `browser-mock-${randomUUID()}`,
      evidence,
    });
  }
}

export class MockBrowserComputerAdapter implements BrowserComputerAdapter {
  async operate(input: unknown) {
    const request = browserComputerRequestSchema.parse(input);
    const finalNavigation = [...request.actions]
      .reverse()
      .find((action) => action.type === "navigate");
    const url =
      finalNavigation?.type === "navigate"
        ? assertPublicHttpUrl(finalNavigation.url).toString()
        : assertPublicHttpUrl(request.startUrl).toString();

    return browserComputerResultSchema.parse({
      provider: "mock",
      runReference: `browser-computer-mock-${randomUUID()}`,
      profileId: request.profileId ?? `browser-profile-mock-${randomUUID()}`,
      page: {
        url,
        title: "Mock interactive page",
        text: "Mock page ready for the connected host.",
        controls: [
          {
            ref: "e1",
            role: "button",
            text: "Continue",
            disabled: false,
            sensitive: false,
          },
        ],
      },
      humanCheckpoint: null,
      actionsCompleted: request.actions.length,
      profileSaved: true,
    });
  }
}

export class MockDesktopWorkspaceAdapter implements DesktopWorkspaceAdapter {
  private static readonly sessions = new Map<
    string,
    { status: "ready" | "paused"; volumeId: string }
  >();
  private static readonly volumes = new Set<string>();

  async createVolume() {
    const volumeId = `volume-mock-${randomUUID()}`;
    MockDesktopWorkspaceAdapter.volumes.add(volumeId);
    return volumeId;
  }

  async provision(
    input: unknown,
    options: { sessionId?: string | null; volumeId: string },
  ) {
    workspaceManifestSchema.parse(input);
    if (!MockDesktopWorkspaceAdapter.volumes.has(options.volumeId)) {
      throw new Error("Unknown mock Desktop volume.");
    }

    const sessionId =
      options.sessionId &&
      MockDesktopWorkspaceAdapter.sessions.has(options.sessionId)
        ? options.sessionId
        : `desktop-mock-${randomUUID()}`;
    MockDesktopWorkspaceAdapter.sessions.set(sessionId, {
      status: "ready",
      volumeId: options.volumeId,
    });

    return workspaceResultSchema.parse({
      provider: "mock",
      sessionId,
      volumeId: options.volumeId,
      snapshotId: `snapshot-mock-${randomUUID()}`,
      status: "ready",
    });
  }

  async checkpoint(sessionId: string) {
    if (!MockDesktopWorkspaceAdapter.sessions.has(sessionId)) {
      throw new Error("Unknown mock Desktop session.");
    }

    return `snapshot-mock-${randomUUID()}`;
  }

  async pause(sessionId: string) {
    const session = MockDesktopWorkspaceAdapter.sessions.get(sessionId);
    if (!session) {
      throw new Error("Unknown mock Desktop session.");
    }

    MockDesktopWorkspaceAdapter.sessions.set(sessionId, {
      ...session,
      status: "paused",
    });
  }

  async destroy(sessionId: string) {
    MockDesktopWorkspaceAdapter.sessions.delete(sessionId);
  }

  async deleteVolume(volumeId: string) {
    MockDesktopWorkspaceAdapter.volumes.delete(volumeId);
  }
}

export class MockSandboxEvaluationAdapter
  implements SandboxEvaluationAdapter
{
  async evaluate(input: unknown) {
    const request = directionalEvaluationRequestSchema.parse(input);
    const participantEvidence = request.participantObservations[0];
    const candidateEvidence = request.candidateObservations[0];

    return directionalEvaluationSchema.parse({
      recommend: true,
      rationale: [
        {
          statement:
            "Their approved context suggests a specific conversation worth testing in person.",
          supportingObservationIds: [
            participantEvidence.id,
            candidateEvidence.id,
          ],
        },
      ],
      uncertainty: "medium",
      caution: "A useful introduction is a hypothesis, not a compatibility claim.",
      evaluator: "mock",
    });
  }
}

export class MockSandboxTaskAdapter implements SandboxTaskAdapter {
  async runRepositoryTask(input: unknown) {
    const request = repositoryTaskRequestSchema.parse(input);
    return repositoryTaskResultSchema.parse({
      provider: "mock",
      runReference: `sandbox-task-mock-${randomUUID()}`,
      repositoryUrl: request.repositoryUrl,
      projectType: "node",
      command: "pnpm test",
      exitCode: 0,
      stdout: "Mock repository checks passed.",
      stderr: "",
      summary: "The isolated mock repository check completed successfully.",
    });
  }
}
