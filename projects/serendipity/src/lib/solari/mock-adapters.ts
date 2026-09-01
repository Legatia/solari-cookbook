import { randomUUID } from "node:crypto";

import {
  directionalEvaluationRequestSchema,
  directionalEvaluationSchema,
  researchRequestSchema,
  researchResultSchema,
  workspaceManifestSchema,
  workspaceResultSchema,
  type BrowserResearchAdapter,
  type DesktopWorkspaceAdapter,
  type SandboxEvaluationAdapter,
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

export class MockDesktopWorkspaceAdapter implements DesktopWorkspaceAdapter {
  private readonly sessions = new Map<string, "ready" | "paused">();

  async provision(input: unknown) {
    workspaceManifestSchema.parse(input);
    const sessionId = `desktop-mock-${randomUUID()}`;
    this.sessions.set(sessionId, "ready");

    return workspaceResultSchema.parse({
      provider: "mock",
      sessionId,
      status: "ready",
    });
  }

  async pause(sessionId: string) {
    if (!this.sessions.has(sessionId)) {
      throw new Error("Unknown mock Desktop session.");
    }

    this.sessions.set(sessionId, "paused");
  }

  async destroy(sessionId: string) {
    this.sessions.delete(sessionId);
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
