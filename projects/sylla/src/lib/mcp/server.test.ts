import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";

import type { SyllaSessionState } from "@/lib/sylla/contracts";
import { EntitlementRequiredError } from "@/lib/sylla/billing";
import type { AgentRunView } from "@/lib/sylla/runs";

import { createSyllaMcpServer, type SyllaMcpServices } from "./server";

const state: SyllaSessionState = {
  participantId: "5c0a3dd5-4e42-485d-b18e-18ddaf172223",
  identity: {
    userId: "4bdf1501-a75f-4cbb-ab8b-e14748a25f61",
    agentId: "0930f8d2-2753-4a0d-91e1-957091d6f349",
    portable: true,
  },
  agentName: "Mira",
  focus: "Find thoughtful people at a local event.",
  stage: "ready",
  event: {
    id: "0ac61474-ff5f-47ec-8d6a-36f4aed822c9",
    name: "Sylla test event",
    city: "Warsaw",
    venue: null,
    startsAt: "2026-09-10T18:00:00.000Z",
  },
  participation: {
    displayName: "Tobias",
    policyVersion: "2026-09-01",
    consentedAt: "2026-09-01T10:00:00.000Z",
    backgroundContinuationAllowed: true,
    availability: [
      {
        id: "ec8772bf-91c2-4c4b-8e4a-b4e49bce0be9",
        startsAt: "2026-09-10T18:00:00.000Z",
        endsAt: "2026-09-10T20:00:00.000Z",
        timezone: "Europe/Warsaw",
      },
    ],
    withdrawnAt: null,
  },
  research: { provider: "mock", runReference: "run-1", completedAt: null },
  sources: [],
  observations: [
    {
      id: "3295a3c0-a857-4be3-9a03-bd31d3995045",
      sourceId: null,
      sourceTitle: null,
      sourceUrl: null,
      claim: "Prefers thoughtful conversations over networking theatre.",
      evidenceExcerpt: null,
      origin: "told_to_me",
      status: "confirmed",
      visibility: "private",
      confidence: "high",
    },
    {
      id: "50898735-9d42-4367-81cf-0328447d8647",
      sourceId: null,
      sourceTitle: null,
      sourceUrl: null,
      claim: "Might enjoy meeting designers.",
      evidenceExcerpt: null,
      origin: "inferred",
      status: "pending",
      visibility: "private",
      confidence: "low",
    },
  ],
  workspace: {
    id: "e275e249-bfc0-4cb7-9dbf-12b0de8e2955",
    provider: "solari",
    sessionId: null,
    volumeId: "volume-private",
    snapshotId: "snapshot-1",
    status: "paused",
    lastActiveAt: "2026-09-01T10:00:00.000Z",
    pausedAt: "2026-09-01T10:05:00.000Z",
  },
};

const clientId = "chatgpt-test-client";
const runId = "test-run-0001";
const leaseToken = "lease-token-that-is-long-enough-for-validation";
const idempotencyKey = "test-operation-0001";
const billing = {
  planKey: "starter-trial",
  status: "trialing" as const,
  creditLimit: 500,
  creditsUsed: 100,
  creditsReserved: 0,
  creditsAvailable: 400,
};
const agentRun: AgentRunView = {
  id: "a4a0b4f0-8d08-45e2-a6dc-9a7323caa67d",
  hostRunId: runId,
  purpose: "Preserve work across host loss",
  taskType: "prepare_reconnect_summary",
  status: "host_orchestrated",
  executionMode: "host_orchestrated",
  backgroundContinuationAllowed: true,
  fallbackBudgetCredits: 1,
  fallbackCreditsUsed: 0,
  fallbackReason: null,
  fallbackProvider: null,
  fallbackModel: null,
  fallbackError: null,
  latestCheckpoint: null,
  handoff: null,
};

function createTestHandler(services: SyllaMcpServices) {
  return createMcpHandler(
    () =>
      createSyllaMcpServer(
        { participantId: state.participantId, clientId },
        services,
      ),
  );
}

function services(
  overrides: Partial<SyllaMcpServices> = {},
): SyllaMcpServices {
  return {
    bootstrapAgent: vi.fn().mockResolvedValue(state),
    loadState: vi.fn().mockResolvedValue(state),
    getBilling: vi.fn().mockResolvedValue(billing),
    acquireLease: vi.fn().mockResolvedValue({
      leaseId: "lease-id",
      clientId,
      runId,
      leaseToken,
      purpose: "test",
      expiresAt: "2026-09-01T10:10:00.000Z",
    }),
    heartbeatLease: vi.fn().mockResolvedValue({
      leaseId: "lease-id",
      expiresAt: "2026-09-01T10:11:00.000Z",
    }),
    releaseLease: vi.fn().mockResolvedValue(undefined),
    prepareBrowserResearch: vi.fn().mockResolvedValue({
      run: { ...agentRun, taskType: "research_approved_sources" },
      sources: [],
      completedCount: 0,
      totalCount: 0,
      nextSourceId: null,
      ambiguousSourceIds: [],
    }),
    researchNextBrowserSource: vi.fn().mockResolvedValue({
      run: { ...agentRun, taskType: "research_approved_sources" },
      sources: [],
      completedCount: 0,
      totalCount: 0,
      nextSourceId: null,
      ambiguousSourceIds: [],
    }),
    getBrowserResearchProgress: vi.fn().mockResolvedValue({
      run: { ...agentRun, taskType: "research_approved_sources" },
      sources: [],
      completedCount: 0,
      totalCount: 0,
      nextSourceId: null,
      ambiguousSourceIds: [],
    }),
    prepareCandidatePair: vi.fn().mockResolvedValue({
      id: "b59cf50a-1c23-49a7-875d-538b29978494",
      status: "shortlisted",
    }),
    evaluateMyDirection: vi.fn().mockResolvedValue({
      id: "1d907539-fbb3-41f7-86fa-3aee3089c18f",
      status: "completed",
      provider: "mock",
      result: {
        recommend: true,
        rationale: [],
        uncertainty: "medium",
        caution: "A recommendation is only a hypothesis.",
        evaluator: "mock",
      },
    }),
    getCandidatePair: vi.fn().mockResolvedValue({
      id: "b59cf50a-1c23-49a7-875d-538b29978494",
      status: "evaluating",
      readyForProposal: false,
      evaluations: [],
    }),
    startRun: vi.fn().mockResolvedValue(agentRun),
    checkpointRun: vi.fn().mockResolvedValue({
      ...agentRun,
      latestCheckpoint: {
        id: "d229274f-5519-4d9a-b533-a1102ac231e8",
        sequence: 1,
        kind: "host_checkpoint",
        summary: "Collected approved evidence.",
        completedActions: ["Collected approved evidence"],
        nextAction: "Review the evidence",
        evidenceRefs: ["source-1"],
        createdBy: "host_orchestrated",
        createdAt: "2026-09-01T10:02:00.000Z",
      },
    }),
    yieldRun: vi.fn().mockResolvedValue({
      ...agentRun,
      status: "waiting_for_host",
    }),
    executeFallback: vi.fn().mockResolvedValue({
      executed: true,
      run: {
        ...agentRun,
        status: "completed",
        executionMode: "internal_fallback",
        fallbackCreditsUsed: 1,
      },
    }),
    getRun: vi.fn().mockResolvedValue(agentRun),
    acknowledgeHandoff: vi.fn().mockResolvedValue(agentRun),
    openWorkspace: vi.fn().mockResolvedValue(state),
    checkpointWorkspace: vi.fn().mockResolvedValue(state),
    pauseWorkspace: vi.fn().mockResolvedValue(state),
    ...overrides,
  };
}

async function callMcp(
  handler: ReturnType<typeof createTestHandler>,
  body: Record<string, unknown>,
) {
  const response = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );

  const responseText = await response.text();
  const dataLine = responseText
    .split("\n")
    .findLast((line) => line.startsWith("data: "));
  const payload = response.headers
    .get("content-type")
    ?.includes("text/event-stream")
    ? dataLine?.slice("data: ".length)
    : responseText;

  if (!payload) throw new Error("MCP returned an empty response.");

  return {
    response,
    body: JSON.parse(payload) as Record<string, unknown>,
  };
}

describe("Sylla MCP server", () => {
  it("lists the portable agent tools over stateless Streamable HTTP", async () => {
    const handler = createTestHandler(services());
    const { response, body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "sylla_bootstrap_agent" }),
          expect.objectContaining({ name: "sylla_get_agent_context" }),
          expect.objectContaining({ name: "sylla_get_agent_workspace" }),
          expect.objectContaining({ name: "sylla_get_plan" }),
          expect.objectContaining({ name: "sylla_acquire_agent_lease" }),
          expect.objectContaining({ name: "sylla_heartbeat_agent_lease" }),
          expect.objectContaining({ name: "sylla_release_agent_lease" }),
          expect.objectContaining({ name: "sylla_start_agent_run" }),
          expect.objectContaining({ name: "sylla_prepare_browser_research" }),
          expect.objectContaining({ name: "sylla_research_next_source" }),
          expect.objectContaining({ name: "sylla_get_research_progress" }),
          expect.objectContaining({ name: "sylla_prepare_candidate_pair" }),
          expect.objectContaining({ name: "sylla_evaluate_my_direction" }),
          expect.objectContaining({ name: "sylla_get_candidate_pair" }),
          expect.objectContaining({ name: "sylla_checkpoint_agent_run" }),
          expect.objectContaining({ name: "sylla_yield_agent_run" }),
          expect.objectContaining({ name: "sylla_attempt_agent_fallback" }),
          expect.objectContaining({ name: "sylla_get_agent_run" }),
          expect.objectContaining({
            name: "sylla_acknowledge_agent_handoff",
          }),
          expect.objectContaining({ name: "sylla_open_agent_workspace" }),
          expect.objectContaining({ name: "sylla_checkpoint_agent_workspace" }),
          expect.objectContaining({ name: "sylla_pause_agent_workspace" }),
        ]),
      },
    });
  });

  it("returns approved memories without leaking pending proposals by default", async () => {
    const handler = createTestHandler(services());
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "sylla_get_agent_context",
        arguments: {},
      },
    });

    const result = body.result as {
      structuredContent: { memories: Array<{ status: string }> };
    };
    expect(result.structuredContent.memories).toHaveLength(1);
    expect(result.structuredContent.memories[0]?.status).toBe("confirmed");
  });

  it("bootstraps idempotently through the injected portable-agent service", async () => {
    const bootstrapAgent = vi.fn().mockResolvedValue(state);
    const handler = createTestHandler(services({ bootstrapAgent }));
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "sylla_bootstrap_agent",
        arguments: { agentName: "Mira" },
      },
    });

    expect(bootstrapAgent).toHaveBeenCalledWith(state.participantId, {
      agentName: "Mira",
    });
    expect(body).toMatchObject({
      result: {
        structuredContent: {
          agent: {
            agentId: state.identity.agentId,
            portable: true,
            workspaceStatus: "paused",
          },
        },
      },
    });
  });

  it("reports plan boundaries and manages an exclusive host lease", async () => {
    const getBilling = vi.fn().mockResolvedValue(billing);
    const acquireLease = vi.fn().mockResolvedValue({
      leaseId: "lease-id",
      clientId,
      runId,
      leaseToken,
      purpose: "Operate the workspace",
      expiresAt: "2026-09-01T10:10:00.000Z",
    });
    const heartbeatLease = vi.fn().mockResolvedValue({
      leaseId: "lease-id",
      expiresAt: "2026-09-01T10:11:00.000Z",
    });
    const releaseLease = vi.fn().mockResolvedValue(undefined);
    const handler = createTestHandler(
      services({ getBilling, acquireLease, heartbeatLease, releaseLease }),
    );

    const planResponse = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: { name: "sylla_get_plan", arguments: {} },
    });
    expect(planResponse.body).toMatchObject({
      result: {
        structuredContent: {
          plan: { creditsAvailable: 400 },
          paymentBoundary: expect.stringContaining("never through MCP"),
        },
      },
    });

    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: {
        name: "sylla_acquire_agent_lease",
        arguments: {
          runId,
          purpose: "Operate the workspace",
          durationSeconds: 90,
        },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 33,
      method: "tools/call",
      params: {
        name: "sylla_heartbeat_agent_lease",
        arguments: { runId, leaseToken, durationSeconds: 90 },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 34,
      method: "tools/call",
      params: {
        name: "sylla_release_agent_lease",
        arguments: { runId, leaseToken },
      },
    });

    expect(acquireLease).toHaveBeenCalledWith({
      participantId: state.participantId,
      clientId,
      runId,
      purpose: "Operate the workspace",
      durationSeconds: 90,
    });
    expect(heartbeatLease).toHaveBeenCalledWith(
      state.participantId,
      { clientId, runId, leaseToken },
      90,
    );
    expect(releaseLease).toHaveBeenCalledWith(state.participantId, {
      clientId,
      runId,
      leaseToken,
    });
  });

  it("exposes a bounded durable run, fallback, and reconnect handoff lifecycle", async () => {
    const startRun = vi.fn().mockResolvedValue(agentRun);
    const checkpointRun = vi.fn().mockResolvedValue(agentRun);
    const yieldRun = vi.fn().mockResolvedValue({
      ...agentRun,
      status: "waiting_for_host",
    });
    const executeFallback = vi.fn().mockResolvedValue({
      executed: true,
      run: {
        ...agentRun,
        status: "completed",
        executionMode: "internal_fallback",
        fallbackCreditsUsed: 1,
      },
    });
    const getRun = vi.fn().mockResolvedValue(agentRun);
    const acknowledgeHandoff = vi.fn().mockResolvedValue(agentRun);
    const handler = createTestHandler(
      services({
        startRun,
        checkpointRun,
        yieldRun,
        executeFallback,
        getRun,
        acknowledgeHandoff,
      }),
    );

    const startResponse = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 35,
      method: "tools/call",
      params: {
        name: "sylla_start_agent_run",
        arguments: {
          runId,
          leaseToken,
          idempotencyKey: "durable-run-0001",
          purpose: agentRun.purpose,
          backgroundContinuationAllowed: true,
          fallbackBudgetCredits: 1,
        },
      },
    });
    expect(startResponse.body).toMatchObject({
      result: {
        structuredContent: {
          fallbackPolicy: {
            approvedTaskType: "prepare_reconnect_summary",
            consequentialActionsAllowed: false,
            rawDebriefStored: false,
          },
        },
      },
    });

    const checkpoint = {
      summary: "Collected approved evidence.",
      completedActions: ["Collected approved evidence"],
      nextAction: "Review the evidence",
      evidenceRefs: ["source-1"],
    };
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 36,
      method: "tools/call",
      params: {
        name: "sylla_checkpoint_agent_run",
        arguments: { agentRunId: agentRun.id, runId, leaseToken, checkpoint },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 37,
      method: "tools/call",
      params: {
        name: "sylla_yield_agent_run",
        arguments: { agentRunId: agentRun.id, runId, leaseToken },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 38,
      method: "tools/call",
      params: {
        name: "sylla_attempt_agent_fallback",
        arguments: { agentRunId: agentRun.id },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 39,
      method: "tools/call",
      params: {
        name: "sylla_get_agent_run",
        arguments: { agentRunId: agentRun.id },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: {
        name: "sylla_acknowledge_agent_handoff",
        arguments: { agentRunId: agentRun.id, runId, leaseToken },
      },
    });

    expect(startRun).toHaveBeenCalledWith({
      participantId: state.participantId,
      authorization: { clientId, runId, leaseToken },
      idempotencyKey: "durable-run-0001",
      purpose: agentRun.purpose,
      backgroundContinuationAllowed: true,
      fallbackBudgetCredits: 1,
    });
    expect(checkpointRun).toHaveBeenCalledWith({
      participantId: state.participantId,
      agentRunId: agentRun.id,
      authorization: { clientId, runId, leaseToken },
      checkpoint,
    });
    expect(yieldRun).toHaveBeenCalledWith({
      participantId: state.participantId,
      agentRunId: agentRun.id,
      authorization: { clientId, runId, leaseToken },
    });
    expect(executeFallback).toHaveBeenCalledWith({
      participantId: state.participantId,
      agentRunId: agentRun.id,
    });
    expect(getRun).toHaveBeenCalledWith(state.participantId, agentRun.id);
    expect(acknowledgeHandoff).toHaveBeenCalledWith({
      participantId: state.participantId,
      agentRunId: agentRun.id,
      authorization: { clientId, runId, leaseToken },
    });
  });

  it("exposes one-source-at-a-time durable Browser research", async () => {
    const browserRun = { ...agentRun, taskType: "research_approved_sources" as const };
    const progress = {
      run: browserRun,
      sources: [
        {
          id: "3295a3c0-a857-4be3-9a03-bd31d3995045",
          url: "https://example.com/about",
          label: "About",
          title: null,
          excerpt: null,
          status: "approved",
        },
      ],
      completedCount: 0,
      totalCount: 1,
      nextSourceId: "3295a3c0-a857-4be3-9a03-bd31d3995045",
      ambiguousSourceIds: [],
    };
    const prepareBrowserResearch = vi.fn().mockResolvedValue(progress);
    const researchNextBrowserSource = vi.fn().mockResolvedValue({
      ...progress,
      run: { ...browserRun, status: "completed" },
      sources: progress.sources.map((source) => ({
        ...source,
        title: "Example",
        excerpt: "Approved evidence",
        status: "complete",
      })),
      completedCount: 1,
      nextSourceId: null,
    });
    const getBrowserResearchProgress = vi.fn().mockResolvedValue(progress);
    const handler = createTestHandler(
      services({
        prepareBrowserResearch,
        researchNextBrowserSource,
        getBrowserResearchProgress,
      }),
    );

    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: {
        name: "sylla_prepare_browser_research",
        arguments: {
          runId,
          leaseToken,
          idempotencyKey: "browser-prepare-0001",
          agentName: "Mira",
          focus: "Understand what work energizes me",
          sources: [{ url: "https://example.com/about", label: "About" }],
          backgroundContinuationAllowed: true,
          fallbackBudgetCredits: 1,
        },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: {
        name: "sylla_research_next_source",
        arguments: {
          agentRunId: agentRun.id,
          runId,
          leaseToken,
          idempotencyKey: "browser-source-0001",
        },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 43,
      method: "tools/call",
      params: {
        name: "sylla_get_research_progress",
        arguments: { agentRunId: agentRun.id },
      },
    });

    expect(prepareBrowserResearch).toHaveBeenCalledWith({
      participantId: state.participantId,
      authorization: { clientId, runId, leaseToken },
      idempotencyKey: "browser-prepare-0001",
      agentName: "Mira",
      focus: "Understand what work energizes me",
      sources: [{ url: "https://example.com/about", label: "About" }],
      backgroundContinuationAllowed: true,
      fallbackBudgetCredits: 1,
    });
    expect(researchNextBrowserSource).toHaveBeenCalledWith({
      participantId: state.participantId,
      agentRunId: agentRun.id,
      authorization: { clientId, runId, leaseToken },
      idempotencyKey: "browser-source-0001",
    });
    expect(getBrowserResearchProgress).toHaveBeenCalledWith(
      state.participantId,
      agentRun.id,
    );
  });

  it("keeps candidate preparation and directional evaluation behind narrow gates", async () => {
    const candidatePairId = "b59cf50a-1c23-49a7-875d-538b29978494";
    const prepareCandidatePair = vi.fn().mockResolvedValue({
      id: candidatePairId,
      status: "shortlisted",
    });
    const evaluateMyDirection = vi.fn().mockResolvedValue({
      id: "1d907539-fbb3-41f7-86fa-3aee3089c18f",
      status: "completed",
      provider: "mock",
      result: {
        recommend: true,
        rationale: [],
        uncertainty: "medium",
        caution: "Hypothesis only",
        evaluator: "mock",
      },
    });
    const getCandidatePair = vi.fn().mockResolvedValue({
      id: candidatePairId,
      status: "evaluating",
      readyForProposal: false,
      evaluations: [],
    });
    const handler = createTestHandler(
      services({ prepareCandidatePair, evaluateMyDirection, getCandidatePair }),
    );

    const prepared = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 44,
      method: "tools/call",
      params: {
        name: "sylla_prepare_candidate_pair",
        arguments: { runId, leaseToken },
      },
    });
    expect(prepared.body).toMatchObject({
      result: {
        structuredContent: {
          gate: {
            identityRevealed: false,
            recommendationMade: false,
            introductionCreated: false,
          },
        },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 45,
      method: "tools/call",
      params: {
        name: "sylla_evaluate_my_direction",
        arguments: {
          candidatePairId,
          runId,
          leaseToken,
          idempotencyKey: "sandbox-direction-0001",
        },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 46,
      method: "tools/call",
      params: {
        name: "sylla_get_candidate_pair",
        arguments: { candidatePairId },
      },
    });

    expect(prepareCandidatePair).toHaveBeenCalledWith({
      participantId: state.participantId,
      authorization: { clientId, runId, leaseToken },
    });
    expect(evaluateMyDirection).toHaveBeenCalledWith({
      participantId: state.participantId,
      candidatePairId,
      authorization: { clientId, runId, leaseToken },
      idempotencyKey: "sandbox-direction-0001",
    });
    expect(getCandidatePair).toHaveBeenCalledWith(
      state.participantId,
      candidatePairId,
    );
  });

  it("opens the persistent home without returning a provider capability", async () => {
    const openWorkspace = vi.fn().mockResolvedValue(state);
    const handler = createTestHandler(services({ openWorkspace }));
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "sylla_open_agent_workspace",
        arguments: { runId, leaseToken, idempotencyKey },
      },
    });

    expect(openWorkspace).toHaveBeenCalledWith(
      state.participantId,
      { clientId, runId, leaseToken },
      idempotencyKey,
    );
    expect(JSON.stringify(body)).not.toContain("streamUrl");
    expect(JSON.stringify(body)).not.toContain("streamCapability");
  });

  it("checkpoints and pauses the persistent home through narrow tools", async () => {
    const checkpointWorkspace = vi.fn().mockResolvedValue(state);
    const pauseWorkspace = vi.fn().mockResolvedValue(state);
    const handler = createTestHandler(
      services({ checkpointWorkspace, pauseWorkspace }),
    );

    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "sylla_checkpoint_agent_workspace",
        arguments: { runId, leaseToken, idempotencyKey: "test-checkpoint-01" },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "sylla_pause_agent_workspace",
        arguments: { runId, leaseToken, idempotencyKey: "test-pause-0001" },
      },
    });

    expect(checkpointWorkspace).toHaveBeenCalledWith(
      state.participantId,
      { clientId, runId, leaseToken },
      "test-checkpoint-01",
    );
    expect(pauseWorkspace).toHaveBeenCalledWith(
      state.participantId,
      { clientId, runId, leaseToken },
      "test-pause-0001",
    );
  });

  it("returns a hosted checkout continuation instead of accepting payment data", async () => {
    const emptyBilling = { ...billing, status: "inactive" as const, creditsAvailable: 0 };
    const openWorkspace = vi.fn().mockRejectedValue(
      new EntitlementRequiredError(
        emptyBilling,
        "https://sylla.test/checkout/capability-token",
      ),
    );
    const handler = createTestHandler(services({ openWorkspace }));
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "sylla_open_agent_workspace",
        arguments: { runId, leaseToken, idempotencyKey },
      },
    });

    expect(body).toMatchObject({
      result: {
        structuredContent: {
          allowed: false,
          reason: "insufficient_entitlement",
          checkout: {
            hosted: true,
            acceptsPaymentDataInMcp: false,
          },
        },
      },
    });
  });
});
