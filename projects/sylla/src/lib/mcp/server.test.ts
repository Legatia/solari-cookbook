import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";

import type { SyllaSessionState } from "@/lib/sylla/contracts";
import { EntitlementRequiredError } from "@/lib/sylla/billing";
import type { AgentRunView } from "@/lib/sylla/runs";
import type { MissionView } from "@/lib/sylla/missions";

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
    permissions: {
      publicSourceResearch: true,
      privateMemoryStorage: true,
      matchmaking: true,
      hostDataBoundary: true,
      backgroundContinuation: true,
    },
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
  personalMemories: [],
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
const mission: MissionView = {
  id: "65c0b649-a997-493f-a935-4b6b2e6dbf12",
  objective: "Research whether this conference is worthwhile.",
  requestedOutcome: "A concise recommendation",
  capability: "research_public_topic",
  status: "ready",
  riskLevel: "observe",
  approvalRequired: false,
  approvedAt: null,
  constraints: {
    sourceUrls: [{ url: "https://example.com", label: "Conference" }],
    maxCredits: 100,
    backgroundContinuationAllowed: false,
  },
  resourcePlan: {
    primary: "browser",
    supporting: [],
    reason: "The objective can be answered from approved public evidence.",
  },
  plan: [
    {
      sequence: 1,
      title: "Validate the approved source scope",
      resource: "sylla",
      risk: "observe",
    },
  ],
  steps: [],
  result: null,
  lastError: null,
  nextAction: "Call sylla_continue_mission.",
  conversationCue: "Continue without narrating internal setup.",
  createdAt: "2026-09-02T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
  completedAt: null,
};

function createTestHandler(
  services: SyllaMcpServices,
  scopes = ["sylla:agent", "sylla:delete"],
) {
  return createMcpHandler(
    () =>
      createSyllaMcpServer(
        { participantId: state.participantId, clientId, scopes },
        services,
      ),
  );
}

function services(
  overrides: Partial<SyllaMcpServices> = {},
): SyllaMcpServices {
  return {
    bootstrapAgent: vi.fn().mockResolvedValue(state),
    completeSetup: vi.fn().mockResolvedValue(state),
    loadState: vi.fn().mockResolvedValue(state),
    proposeMemory: vi.fn().mockResolvedValue({
      id: "3295a3c0-a857-4be3-9a03-bd31d3995045",
      summary: "I prefer quiet one-on-one conversations.",
      status: "pending",
      visibility: "private",
      approvalRequired: true,
    }),
    getBilling: vi.fn().mockResolvedValue(billing),
    getConversationProfile: vi.fn().mockResolvedValue({
      responseLength: "short",
      warmth: 3,
      directness: 4,
      humor: "light",
      challengeStyle: "gentle",
      preferredAddress: "Tobias",
      preferredBehaviors: [],
      avoidedBehaviors: [],
      version: 1,
      updatedAt: "2026-09-02T10:00:00.000Z",
    }),
    prepareConversationBrief: vi.fn().mockResolvedValue({
      agent: { name: "Mira", preferredAddress: "Tobias" },
      relationship: {
        stage: "familiar",
        approvedMemoryCount: 2,
        relevantMemories: [
          {
            id: "3295a3c0-a857-4be3-9a03-bd31d3995045",
            text: "Prefers thoughtful conversations over networking theatre.",
            kind: "approved_observation",
          },
        ],
      },
      voice: {
        responseLength: "short",
        warmth: 3,
        directness: 4,
        humor: "light",
        challengeStyle: "gentle",
        preferredAddress: "Tobias",
        preferredBehaviors: [],
        avoidedBehaviors: [],
        version: 1,
        updatedAt: "2026-09-02T10:00:00.000Z",
      },
      responseContract: {
        openingMove: "Respond to the actual point immediately.",
        tone: "Be quietly warm and direct.",
        shape: "Usually two to four sentences.",
        memoryUse: "Use relevant memory quietly.",
        questions: "Ask at most one genuine question.",
        honesty: "Be warm without claiming human feelings.",
        avoid: ["Certainly!"],
      },
      privacy: {
        fullTranscriptStoredBySylla: false,
        onlyApprovedMemoryIncluded: true,
        currentTopicPersistedBySylla: false,
      },
    }),
    updateConversationProfile: vi.fn().mockResolvedValue({
      responseLength: "terse",
      warmth: 3,
      directness: 5,
      humor: "dry",
      challengeStyle: "direct",
      preferredAddress: "Tobias",
      preferredBehaviors: ["Disagree plainly when needed"],
      avoidedBehaviors: ["End every answer with an offer"],
      version: 2,
      updatedAt: "2026-09-02T10:05:00.000Z",
    }),
    startMission: vi.fn().mockResolvedValue(mission),
    getMission: vi.fn().mockResolvedValue(mission),
    approveMission: vi.fn().mockResolvedValue({
      ...mission,
      status: "ready",
      approvalRequired: true,
      approvedAt: "2026-09-02T10:01:00.000Z",
    }),
    continueMission: vi.fn().mockResolvedValue({
      ...mission,
      status: "completed",
      result: { completedCount: 1 },
      nextAction: "Report the result naturally.",
      completedAt: "2026-09-02T10:02:00.000Z",
    }),
    operateBrowser: vi.fn().mockResolvedValue({
      ...mission,
      capability: "operate_web_account",
      status: "waiting_for_user",
      result: {
        interactive: true,
        observation: {
          url: "https://example.com/account",
          title: "Account",
          text: "Account settings",
          controls: [],
        },
      },
      nextAction: "Use sylla_act_on_web.",
    }),
    cancelMission: vi.fn().mockResolvedValue({
      ...mission,
      status: "canceled",
      nextAction: "The mission is canceled.",
    }),
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
    approveDisclosure: vi.fn().mockResolvedValue({
      id: "3dad893f-9d0c-4782-8da8-82e84339fcb4",
      observationIds: ["3295a3c0-a857-4be3-9a03-bd31d3995045"],
    }),
    createIntroduction: vi.fn().mockResolvedValue({
      id: "84145b35-3fae-4910-af85-ce9e49f7a606",
      status: "waiting",
    }),
    respondToIntroduction: vi.fn().mockResolvedValue({
      id: "84145b35-3fae-4910-af85-ce9e49f7a606",
      status: "waiting",
      myDecision: "accepted",
      preview: [{ id: "other-observation", claim: "Builds communities." }],
      otherParticipant: null,
      meeting: null,
      privacy: {
        otherDecisionRevealed: false,
        identityRevealed: false,
        rawRationaleRevealed: false,
      },
    }),
    getIntroduction: vi.fn().mockResolvedValue({
      id: "84145b35-3fae-4910-af85-ce9e49f7a606",
      status: "waiting",
      myDecision: null,
      preview: [{ id: "other-observation", claim: "Builds communities." }],
      otherParticipant: null,
      meeting: null,
      privacy: {
        otherDecisionRevealed: false,
        identityRevealed: false,
        rawRationaleRevealed: false,
      },
    }),
    submitOutcome: vi.fn().mockResolvedValue({
      outcome: {
        id: "f2ee2a67-6594-4657-b101-3df414cb2ba3",
        introductionProposalId: "84145b35-3fae-4910-af85-ce9e49f7a606",
        met: true,
        worthwhile: "yes",
        meetAgain: "yes",
        alreadyKnew: false,
        wouldHaveMetWithoutSylla: "no",
        contactExchanged: true,
        secondInteractionPlanned: false,
        wantsAnotherIntroduction: true,
        debriefDisposition: "quick",
        proposedMemoryCount: 1,
        submittedAt: "2026-09-10T20:00:00.000Z",
      },
      memoryProposals: [
        {
          id: "51fab9e4-e6af-4668-9161-763af0ad59df",
          summary: "I value conversations grounded in local community.",
          status: "proposed",
          visibility: "private",
          approvedAt: null,
          source: "introduction_debrief",
        },
      ],
      otherOutcomeRevealed: false,
    }),
    getOwnOutcome: vi.fn().mockResolvedValue(null),
    listPersonalMemories: vi.fn().mockResolvedValue([]),
    reviewMemory: vi.fn().mockResolvedValue({
      id: "51fab9e4-e6af-4668-9161-763af0ad59df",
      summary: "I value conversations grounded in local community.",
      status: "approved",
      visibility: "private",
      approvedAt: "2026-09-10T20:05:00.000Z",
    }),
    reviewObservation: vi.fn().mockResolvedValue(state),
    exportAgent: vi.fn().mockResolvedValue({
      format: "sylla-portable-agent",
      version: 2,
      generatedAt: "2026-09-10T20:10:00.000Z",
      identity: {
        userId: state.identity.userId,
        agentId: state.identity.agentId,
        agentName: state.agentName,
        focus: state.focus,
      },
      participationRefs: [state.participantId],
      conversationProfile: {
        responseLength: "short",
        warmth: 3,
        directness: 4,
        humor: "light",
        challengeStyle: "gentle",
        preferredAddress: "Tobias",
        preferredBehaviors: [],
        avoidedBehaviors: [],
        version: 1,
        updatedAt: "2026-09-10T20:00:00.000Z",
      },
      approvedSources: [],
      approvedObservations: [],
      approvedPersonalMemories: [],
      introductionOutcomes: [],
      privacy: {
        rawDebriefIncluded: false,
        otherParticipantOutcomeIncluded: false,
        providerCredentialIncluded: false,
        desktopCapabilityIncluded: false,
      },
    }),
    deleteAgent: vi.fn().mockResolvedValue({
      deleted: true,
      participantRecordsDeleted: 1,
      recoverableBySylla: false,
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
          expect.objectContaining({ name: "sylla_prepare_conversation" }),
          expect.objectContaining({ name: "sylla_tune_conversation" }),
          expect.objectContaining({ name: "sylla_get_setup_guide" }),
          expect.objectContaining({ name: "sylla_complete_setup" }),
          expect.objectContaining({ name: "sylla_get_agent_context" }),
          expect.objectContaining({ name: "sylla_start_mission" }),
          expect.objectContaining({ name: "sylla_get_mission" }),
          expect.objectContaining({ name: "sylla_approve_mission" }),
          expect.objectContaining({ name: "sylla_continue_mission" }),
          expect.objectContaining({ name: "sylla_act_on_web" }),
          expect.objectContaining({ name: "sylla_cancel_mission" }),
          expect.objectContaining({ name: "sylla_remember" }),
          expect.objectContaining({ name: "sylla_review_observation" }),
          expect.objectContaining({ name: "sylla_research" }),
          expect.objectContaining({ name: "sylla_find_private_introduction" }),
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
          expect.objectContaining({ name: "sylla_approve_my_disclosure" }),
          expect.objectContaining({
            name: "sylla_create_introduction_proposal",
          }),
          expect.objectContaining({ name: "sylla_respond_to_introduction" }),
          expect.objectContaining({ name: "sylla_get_introduction" }),
          expect.objectContaining({
            name: "sylla_submit_my_introduction_outcome",
          }),
          expect.objectContaining({
            name: "sylla_get_my_introduction_outcome",
          }),
          expect.objectContaining({ name: "sylla_review_my_memory" }),
          expect.objectContaining({ name: "sylla_export_my_agent" }),
          expect.objectContaining({ name: "sylla_delete_my_agent" }),
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

  it("hides permanent deletion without the elevated OAuth scope", async () => {
    const handler = createTestHandler(services(), ["sylla:agent"]);
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 101,
      method: "tools/list",
      params: {},
    });
    const tools = (body.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.some((tool) => tool.name === "sylla_export_my_agent")).toBe(
      true,
    );
    expect(tools.some((tool) => tool.name === "sylla_delete_my_agent")).toBe(
      false,
    );
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

  it("creates an explicit memory proposal through the companion tool", async () => {
    const proposeMemory = vi.fn().mockResolvedValue({
      id: "3295a3c0-a857-4be3-9a03-bd31d3995045",
      summary: "I recharge through quiet one-on-one conversations.",
      status: "pending",
      visibility: "private",
      approvalRequired: true,
    });
    const handler = createTestHandler(services({ proposeMemory }));
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 202,
      method: "tools/call",
      params: {
        name: "sylla_remember",
        arguments: {
          summary: "I recharge through quiet one-on-one conversations.",
          visibility: "private",
        },
      },
    });

    expect(proposeMemory).toHaveBeenCalledWith({
      participantId: state.participantId,
      summary: "I recharge through quiet one-on-one conversations.",
      visibility: "private",
    });
    expect(body).toMatchObject({
      result: {
        structuredContent: {
          memory: { status: "pending", approvalRequired: true },
        },
      },
    });
  });

  it("runs high-level research under an internally managed lease", async () => {
    const acquireLease = vi.fn().mockResolvedValue({
      leaseId: "lease-id",
      clientId,
      runId: "companion-research-research-123",
      leaseToken,
      purpose: "Research participant-approved public sources",
      expiresAt: "2026-09-01T10:10:00.000Z",
    });
    const releaseLease = vi.fn().mockResolvedValue(undefined);
    const prepareBrowserResearch = vi.fn().mockResolvedValue({
      run: { ...agentRun, taskType: "research_approved_sources" },
      sources: [{ id: "source-1", url: "https://example.com", label: "Example", title: null, excerpt: null, status: "approved" }],
      completedCount: 0,
      totalCount: 1,
      nextSourceId: "source-1",
      ambiguousSourceIds: [],
    });
    const researchNextBrowserSource = vi.fn().mockResolvedValue({
      run: { ...agentRun, taskType: "research_approved_sources" },
      sources: [{ id: "source-1", url: "https://example.com", label: "Example", title: "Example", excerpt: "Evidence", status: "complete" }],
      completedCount: 1,
      totalCount: 1,
      nextSourceId: null,
      ambiguousSourceIds: [],
    });
    const handler = createTestHandler(
      services({
        acquireLease,
        releaseLease,
        prepareBrowserResearch,
        researchNextBrowserSource,
      }),
    );
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 203,
      method: "tools/call",
      params: {
        name: "sylla_research",
        arguments: {
          requestId: "research-123",
          focus: "Understand this project",
          sources: [{ url: "https://example.com", label: "Example" }],
        },
      },
    });

    expect(acquireLease).toHaveBeenCalledOnce();
    expect(researchNextBrowserSource).toHaveBeenCalledOnce();
    expect(releaseLease).toHaveBeenCalledOnce();
    expect(body).toMatchObject({
      result: { structuredContent: { progress: { completedCount: 1 } } },
    });
  });

  it("runs one private introduction direction without disclosing identity", async () => {
    const releaseLease = vi.fn().mockResolvedValue(undefined);
    const handler = createTestHandler(services({ releaseLease }));
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 204,
      method: "tools/call",
      params: {
        name: "sylla_find_private_introduction",
        arguments: { requestId: "intro-123" },
      },
    });
    expect(releaseLease).toHaveBeenCalledOnce();
    expect(body).toMatchObject({
      result: {
        structuredContent: {
          status: "waiting_for_other_agent",
          candidatePair: { readyForProposal: false },
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("otherParticipant");
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

  it("prepares a compact private conversation brief for the current topic", async () => {
    const prepareConversationBrief = vi.fn(
      services().prepareConversationBrief,
    );
    const handler = createTestHandler(
      services({ prepareConversationBrief }),
    );
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 306,
      method: "tools/call",
      params: {
        name: "sylla_prepare_conversation",
        arguments: { currentTopic: "I am unsure about attending the event." },
      },
    });

    expect(prepareConversationBrief).toHaveBeenCalledWith(
      state.participantId,
      { currentTopic: "I am unsure about attending the event." },
    );
    expect(body).toMatchObject({
      result: {
        structuredContent: {
          conversation: {
            relationship: { stage: "familiar" },
            privacy: {
              fullTranscriptStoredBySylla: false,
              onlyApprovedMemoryIncluded: true,
            },
          },
        },
      },
    });
  });

  it("persists only conversation preferences explicitly supplied by the participant", async () => {
    const updateConversationProfile = vi.fn(
      services().updateConversationProfile,
    );
    const handler = createTestHandler(
      services({ updateConversationProfile }),
    );
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 307,
      method: "tools/call",
      params: {
        name: "sylla_tune_conversation",
        arguments: {
          responseLength: "terse",
          directness: 5,
          humor: "dry",
          avoidedBehaviors: ["End every answer with an offer"],
        },
      },
    });

    expect(updateConversationProfile).toHaveBeenCalledWith(
      state.participantId,
      expect.objectContaining({ responseLength: "terse", directness: 5 }),
    );
    expect(body).toMatchObject({
      result: {
        structuredContent: {
          conversationProfile: {
            responseLength: "terse",
            directness: 5,
            version: 2,
          },
        },
      },
    });
  });

  it("completes first-time setup entirely through the MCP conversation", async () => {
    const completeSetup = vi.fn().mockResolvedValue(state);
    const handler = createTestHandler(services({ completeSetup }));
    const input = {
      displayName: "Tobias",
      agentName: "Mira",
      focus: "Find thoughtful people at a local event.",
      policyVersion: "2026-09-01",
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
    } as const;
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 302,
      method: "tools/call",
      params: { name: "sylla_complete_setup", arguments: input },
    });

    expect(completeSetup).toHaveBeenCalledWith(state.participantId, input);
    expect(body).toMatchObject({
      result: { structuredContent: { setupComplete: true } },
    });
  });

  it("returns a conversation-first setup path with an optional web fallback", async () => {
    const onboardingState: SyllaSessionState = {
      ...state,
      agentName: null,
      focus: null,
      stage: "consent",
      participation: {
        ...state.participation,
        displayName: null,
        policyVersion: null,
        consentedAt: null,
        backgroundContinuationAllowed: false,
        availability: [],
      },
    };
    const handler = createTestHandler(
      services({ loadState: vi.fn().mockResolvedValue(onboardingState) }),
    );
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 304,
      method: "tools/call",
      params: { name: "sylla_get_setup_guide", arguments: {} },
    });

    expect(body).toMatchObject({
      result: {
        structuredContent: {
          setupComplete: false,
          onboarding: {
            mode: "conversation_first",
            flow: expect.arrayContaining([
              expect.objectContaining({ id: "purpose" }),
              expect.objectContaining({ id: "trust" }),
              expect.objectContaining({
                id: "introductions",
                optional: true,
              }),
            ]),
            responseContract: {
              questionsPerReply: 1,
              headings: false,
              checklistLanguage: false,
            },
            completion: {
              tool: "sylla_complete_setup",
              availabilityRequiredOnlyForMatchmaking: true,
            },
            fallback: {
              url: expect.stringContaining("/app"),
            },
          },
        },
      },
    });
  });

  it("reviews a research memory without sending the participant to the web app", async () => {
    const reviewed = {
      ...state,
      observations: state.observations.map((observation) =>
        observation.id === "50898735-9d42-4367-81cf-0328447d8647"
          ? { ...observation, status: "confirmed" as const }
          : observation,
      ),
    };
    const reviewObservation = vi.fn().mockResolvedValue(reviewed);
    const handler = createTestHandler(services({ reviewObservation }));
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 303,
      method: "tools/call",
      params: {
        name: "sylla_review_observation",
        arguments: {
          observationId: "50898735-9d42-4367-81cf-0328447d8647",
          decision: "approve",
        },
      },
    });

    expect(reviewObservation).toHaveBeenCalledWith({
      participantId: state.participantId,
      observationId: "50898735-9d42-4367-81cf-0328447d8647",
      decision: "approve",
    });
    expect(body).toMatchObject({
      result: {
        structuredContent: {
          observation: { status: "confirmed" },
          pendingCount: 0,
        },
      },
    });
  });

  it("turns a natural objective into a managed mission and continues it", async () => {
    const startMission = vi.fn().mockResolvedValue(mission);
    const completedMission = {
      ...mission,
      status: "completed" as const,
      result: { completedCount: 1 },
      completedAt: "2026-09-02T10:02:00.000Z",
    };
    const continueMission = vi.fn().mockResolvedValue(completedMission);
    const handler = createTestHandler(
      services({ startMission, continueMission }),
    );
    const { body: started } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 304,
      method: "tools/call",
      params: {
        name: "sylla_start_mission",
        arguments: {
          requestId: "conference-mission-001",
          objective: "Research whether this conference is worthwhile.",
          requestedOutcome: "A concise recommendation",
          sources: [
            { url: "https://example.com", label: "Conference" },
          ],
        },
      },
    });
    expect(startMission).toHaveBeenCalledWith(
      state.participantId,
      clientId,
      expect.objectContaining({
        objective: "Research whether this conference is worthwhile.",
        maxCredits: 100,
        backgroundContinuationAllowed: false,
      }),
    );
    expect(started).toMatchObject({
      result: {
        structuredContent: {
          mission: {
            capability: "research_public_topic",
            resourcePlan: { primary: "browser" },
          },
        },
      },
    });

    const { body: continued } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 305,
      method: "tools/call",
      params: {
        name: "sylla_continue_mission",
        arguments: { missionId: mission.id },
      },
    });
    expect(continueMission).toHaveBeenCalledWith(
      state.participantId,
      clientId,
      mission.id,
    );
    expect(continued).toMatchObject({
      result: {
        structuredContent: { mission: { status: "completed" } },
      },
    });
  });

  it("lets the connected host continue an approved web task through referenced controls", async () => {
    const operateBrowser = vi.fn().mockResolvedValue({
      ...mission,
      capability: "operate_web_account" as const,
      status: "completed" as const,
      result: { interactive: true, summary: "The form was submitted." },
      completedAt: "2026-09-02T10:03:00.000Z",
    });
    const handler = createTestHandler(services({ operateBrowser }));
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 308,
      method: "tools/call",
      params: {
        name: "sylla_act_on_web",
        arguments: {
          missionId: mission.id,
          requestId: "web-action-0001",
          actions: [{ type: "click", ref: "e1" }],
          done: true,
          summary: "The form was submitted.",
        },
      },
    });

    expect(operateBrowser).toHaveBeenCalledWith(
      state.participantId,
      clientId,
      expect.objectContaining({
        missionId: mission.id,
        actions: [{ type: "click", ref: "e1" }],
        done: true,
      }),
    );
    expect(body).toMatchObject({
      result: {
        structuredContent: { mission: { status: "completed" } },
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

  it("keeps disclosure and acceptance bilateral, private, and host-controlled", async () => {
    const candidatePairId = "b59cf50a-1c23-49a7-875d-538b29978494";
    const introductionProposalId = "84145b35-3fae-4910-af85-ce9e49f7a606";
    const observationIds = ["3295a3c0-a857-4be3-9a03-bd31d3995045"];
    const approveDisclosure = vi.fn().mockResolvedValue({
      id: "3dad893f-9d0c-4782-8da8-82e84339fcb4",
      observationIds,
    });
    const createIntroduction = vi.fn().mockResolvedValue({
      id: introductionProposalId,
      status: "waiting",
    });
    const privateView = {
      id: introductionProposalId,
      status: "waiting",
      myDecision: "accepted",
      preview: [{ id: "preview-1", claim: "Builds communities." }],
      otherParticipant: null,
      meeting: null,
      privacy: {
        otherDecisionRevealed: false,
        identityRevealed: false,
        rawRationaleRevealed: false,
      },
    };
    const respondToIntroduction = vi.fn().mockResolvedValue(privateView);
    const getIntroduction = vi.fn().mockResolvedValue(privateView);
    const handler = createTestHandler(
      services({
        approveDisclosure,
        createIntroduction,
        respondToIntroduction,
        getIntroduction,
      }),
    );

    const approved = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 47,
      method: "tools/call",
      params: {
        name: "sylla_approve_my_disclosure",
        arguments: { candidatePairId, observationIds, runId, leaseToken },
      },
    });
    expect(approved.body).toMatchObject({
      result: {
        structuredContent: {
          gate: { identityRevealed: false, humanHostRequired: true },
        },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 48,
      method: "tools/call",
      params: {
        name: "sylla_create_introduction_proposal",
        arguments: { candidatePairId, runId, leaseToken },
      },
    });
    const responded = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 49,
      method: "tools/call",
      params: {
        name: "sylla_respond_to_introduction",
        arguments: {
          introductionProposalId,
          decision: "accepted",
          block: false,
          runId,
          leaseToken,
        },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: {
        name: "sylla_get_introduction",
        arguments: { introductionProposalId },
      },
    });

    expect(approveDisclosure).toHaveBeenCalledWith({
      participantId: state.participantId,
      candidatePairId,
      authorization: { clientId, runId, leaseToken },
      observationIds,
    });
    expect(createIntroduction).toHaveBeenCalledWith({
      participantId: state.participantId,
      candidatePairId,
      authorization: { clientId, runId, leaseToken },
    });
    expect(respondToIntroduction).toHaveBeenCalledWith({
      participantId: state.participantId,
      introductionProposalId,
      authorization: { clientId, runId, leaseToken },
      decision: "accepted",
      block: false,
    });
    expect(getIntroduction).toHaveBeenCalledWith(
      state.participantId,
      introductionProposalId,
    );
    expect(responded.body).toMatchObject({
      result: {
        structuredContent: {
          introduction: {
            otherParticipant: null,
            meeting: null,
            privacy: { identityRevealed: false },
          },
        },
      },
    });
  });

  it("accepts only structured outcomes and reviewable memory proposals", async () => {
    const introductionProposalId = "84145b35-3fae-4910-af85-ce9e49f7a606";
    const memoryId = "51fab9e4-e6af-4668-9161-763af0ad59df";
    const outcome = {
      met: true,
      worthwhile: "yes" as const,
      meetAgain: "yes" as const,
      alreadyKnew: false,
      wouldHaveMetWithoutSylla: "no" as const,
      contactExchanged: true,
      secondInteractionPlanned: false,
      wantsAnotherIntroduction: true,
      debriefDisposition: "quick" as const,
      proposedMemories: [
        "I value conversations grounded in local community.",
      ],
    };
    const submitOutcome = vi.fn().mockResolvedValue({
      outcome: {
        id: "f2ee2a67-6594-4657-b101-3df414cb2ba3",
        introductionProposalId,
        ...outcome,
        proposedMemoryCount: 1,
        submittedAt: "2026-09-10T20:00:00.000Z",
      },
      memoryProposals: [
        {
          id: memoryId,
          summary: outcome.proposedMemories[0],
          status: "proposed",
          visibility: "private",
          approvedAt: null,
          source: "introduction_debrief",
        },
      ],
      otherOutcomeRevealed: false,
    });
    const getOwnOutcome = vi.fn().mockResolvedValue(null);
    const reviewMemory = vi.fn().mockResolvedValue({
      id: memoryId,
      summary: outcome.proposedMemories[0],
      status: "approved",
      visibility: "private",
      approvedAt: "2026-09-10T20:05:00.000Z",
    });
    const handler = createTestHandler(
      services({ submitOutcome, getOwnOutcome, reviewMemory }),
    );

    const submitted = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 51,
      method: "tools/call",
      params: {
        name: "sylla_submit_my_introduction_outcome",
        arguments: {
          introductionProposalId,
          outcome,
          runId,
          leaseToken,
        },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 52,
      method: "tools/call",
      params: {
        name: "sylla_get_my_introduction_outcome",
        arguments: { introductionProposalId },
      },
    });
    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 53,
      method: "tools/call",
      params: {
        name: "sylla_review_my_memory",
        arguments: { memoryId, decision: "approve", runId, leaseToken },
      },
    });

    expect(submitOutcome).toHaveBeenCalledWith({
      participantId: state.participantId,
      introductionProposalId,
      authorization: { clientId, runId, leaseToken },
      outcome,
    });
    expect(getOwnOutcome).toHaveBeenCalledWith(
      state.participantId,
      introductionProposalId,
    );
    expect(reviewMemory).toHaveBeenCalledWith({
      participantId: state.participantId,
      memoryId,
      authorization: { clientId, runId, leaseToken },
      decision: "approve",
      editedSummary: undefined,
    });
    expect(submitted.body).toMatchObject({
      result: {
        structuredContent: {
          retentionPolicy: {
            rawDebriefAccepted: false,
            rawDebriefPersisted: false,
            proposedMemoriesRequireReview: true,
          },
          submission: { otherOutcomeRevealed: false },
        },
      },
    });

    const rejected = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 54,
      method: "tools/call",
      params: {
        name: "sylla_submit_my_introduction_outcome",
        arguments: {
          introductionProposalId,
          outcome: { ...outcome, rawDebrief: "must not cross MCP" },
          runId,
          leaseToken,
        },
      },
    });
    expect(submitOutcome).toHaveBeenCalledTimes(1);
    expect(rejected.body).toMatchObject({ result: { isError: true } });
  });

  it("exports portable state and requires exact destructive deletion consent", async () => {
    const exportAgent = vi.fn().mockResolvedValue({
      format: "sylla-portable-agent",
      version: 2,
      generatedAt: "2026-09-10T20:10:00.000Z",
      identity: {
        userId: state.identity.userId,
        agentId: state.identity.agentId,
        agentName: state.agentName,
        focus: state.focus,
      },
      participationRefs: [state.participantId],
      conversationProfile: {
        responseLength: "short",
        warmth: 3,
        directness: 4,
        humor: "light",
        challengeStyle: "gentle",
        preferredAddress: "Tobias",
        preferredBehaviors: [],
        avoidedBehaviors: [],
        version: 1,
        updatedAt: "2026-09-10T20:00:00.000Z",
      },
      approvedSources: [],
      approvedObservations: [],
      approvedPersonalMemories: [],
      introductionOutcomes: [],
      privacy: {
        rawDebriefIncluded: false,
        otherParticipantOutcomeIncluded: false,
        providerCredentialIncluded: false,
        desktopCapabilityIncluded: false,
      },
    });
    const deleteAgent = vi.fn().mockResolvedValue({
      deleted: true,
      participantRecordsDeleted: 1,
      recoverableBySylla: false,
    });
    const handler = createTestHandler(services({ exportAgent, deleteAgent }));

    const exported = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 55,
      method: "tools/call",
      params: { name: "sylla_export_my_agent", arguments: {} },
    });
    expect(exported.body).toMatchObject({
      result: {
        structuredContent: {
          export: {
            format: "sylla-portable-agent",
            privacy: {
              rawDebriefIncluded: false,
              providerCredentialIncluded: false,
            },
          },
        },
      },
    });

    const invalid = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 56,
      method: "tools/call",
      params: {
        name: "sylla_delete_my_agent",
        arguments: { confirmation: "delete", runId, leaseToken },
      },
    });
    expect(invalid.body).toMatchObject({ result: { isError: true } });
    expect(deleteAgent).not.toHaveBeenCalled();

    await callMcp(handler, {
      jsonrpc: "2.0",
      id: 57,
      method: "tools/call",
      params: {
        name: "sylla_delete_my_agent",
        arguments: {
          confirmation: "DELETE MY SYLLA AGENT",
          runId,
          leaseToken,
        },
      },
    });
    expect(exportAgent).toHaveBeenCalledWith(state.participantId);
    expect(deleteAgent).toHaveBeenCalledWith({
      participantId: state.participantId,
      authorization: { clientId, runId, leaseToken },
      confirmation: "DELETE MY SYLLA AGENT",
    });
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
