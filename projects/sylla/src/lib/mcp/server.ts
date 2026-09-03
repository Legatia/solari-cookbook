import { createHash } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { SyllaSessionState } from "@/lib/sylla/contracts";
import { proposeConversationMemory } from "@/lib/sylla/companion";
import {
  conversationBriefInputSchema,
  conversationProfileInputSchema,
  getConversationProfile,
  prepareConversationBrief,
  updateConversationProfile,
  type ConversationBrief,
  type ConversationProfileInput,
  type ConversationProfileView,
} from "@/lib/sylla/conversation";
import {
  EntitlementRequiredError,
  getBillingSummary,
  OPERATION_CREDITS,
  type BillingSummary,
} from "@/lib/sylla/billing";
import {
  getBrowserResearchProgress,
  prepareBrowserResearch,
  researchNextBrowserSource,
  type BrowserResearchProgress,
  type BrowserResearchSourceInput,
} from "@/lib/sylla/browser-research";
import {
  interactiveBrowserInputSchema,
  operateInteractiveBrowserMission,
  type InteractiveBrowserInput,
} from "@/lib/sylla/computer-use";
import { updatePortableAgent } from "@/lib/sylla/identity";
import {
  approveDisclosureEnvelope,
  createIntroductionProposal,
  getIntroductionProposalForParticipant,
  respondToIntroductionProposal,
} from "@/lib/sylla/introductions";
import {
  acquireRuntimeLease,
  heartbeatRuntimeLease,
  releaseRuntimeLease,
  requireRuntimeLease,
  type AcquiredRuntimeLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import {
  evaluatePairDirection,
  getCandidatePairForParticipant,
  getCandidateShortlist,
  reserveCandidatePair,
} from "@/lib/sylla/matching";
import { continueMission } from "@/lib/sylla/mission-execution";
import {
  approveMission,
  cancelMission,
  getMission,
  startMission,
  startMissionSchema,
  type MissionView,
  type StartMissionInput,
} from "@/lib/sylla/missions";
import {
  getOwnIntroductionOutcome,
  listParticipantMemories,
  reviewPersonalMemory,
  structuredOutcomeSchema,
  submitIntroductionOutcome,
} from "@/lib/sylla/outcomes";
import { reviewObservation } from "@/lib/sylla/observations";
import {
  completeConversationalSetup,
  PARTICIPATION_PERMISSION_COPY,
  PARTICIPATION_POLICY_VERSION,
  type ConversationalSetupInput,
} from "@/lib/sylla/participation";
import {
  buildPortableAgentExport,
  deletePortableAgent,
} from "@/lib/sylla/portability";
import {
  acknowledgeAgentRunHandoff,
  checkpointAgentRun,
  executeFallbackOnce,
  getAgentRun,
  startAgentRun,
  type AgentRunView,
  type VisibleRunCheckpoint,
  yieldAgentRunToBackground,
} from "@/lib/sylla/runs";
import { loadSessionState } from "@/lib/sylla/session";
import {
  checkpointParticipantWorkspace,
  openParticipantWorkspace,
  pauseParticipantWorkspace,
} from "@/lib/sylla/workspace";

type BootstrapInput = {
  agentName?: string;
  focus?: string;
};

export type SyllaMcpServices = {
  bootstrapAgent: (
    participantId: string,
    input: BootstrapInput,
  ) => Promise<SyllaSessionState>;
  completeSetup: (
    participantId: string,
    input: ConversationalSetupInput,
  ) => Promise<SyllaSessionState>;
  loadState: (participantId: string) => Promise<SyllaSessionState>;
  proposeMemory: (input: {
    participantId: string;
    summary: string;
    visibility: "private" | "shareable";
  }) => ReturnType<typeof proposeConversationMemory>;
  getBilling: (participantId: string) => Promise<BillingSummary>;
  getConversationProfile: (
    participantId: string,
  ) => Promise<ConversationProfileView>;
  prepareConversationBrief: (
    participantId: string,
    input: { currentTopic?: string },
  ) => Promise<ConversationBrief>;
  updateConversationProfile: (
    participantId: string,
    input: ConversationProfileInput,
  ) => Promise<ConversationProfileView>;
  startMission: (
    participantId: string,
    clientId: string,
    input: StartMissionInput,
  ) => Promise<MissionView>;
  getMission: (participantId: string, missionId: string) => Promise<MissionView>;
  approveMission: (
    participantId: string,
    missionId: string,
    confirmation: "I APPROVE THIS MISSION",
  ) => Promise<MissionView>;
  continueMission: (
    participantId: string,
    clientId: string,
    missionId: string,
  ) => Promise<MissionView>;
  operateBrowser: (
    participantId: string,
    clientId: string,
    input: InteractiveBrowserInput,
  ) => Promise<MissionView>;
  cancelMission: (
    participantId: string,
    missionId: string,
    confirmation: "CANCEL THIS MISSION",
  ) => Promise<MissionView>;
  acquireLease: (input: {
    participantId: string;
    clientId: string;
    runId: string;
    purpose: string;
    durationSeconds?: number;
  }) => Promise<AcquiredRuntimeLease>;
  heartbeatLease: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
    durationSeconds?: number,
  ) => Promise<{ leaseId: string; expiresAt: string }>;
  releaseLease: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
  ) => Promise<void>;
  prepareBrowserResearch: (input: {
    participantId: string;
    authorization: RuntimeLeaseAuthorization;
    idempotencyKey: string;
    agentName?: string;
    focus: string;
    sources: BrowserResearchSourceInput[];
    backgroundContinuationAllowed: boolean;
    fallbackBudgetCredits: number;
  }) => Promise<BrowserResearchProgress>;
  researchNextBrowserSource: (input: {
    participantId: string;
    agentRunId: string;
    authorization: RuntimeLeaseAuthorization;
    idempotencyKey: string;
  }) => Promise<BrowserResearchProgress>;
  getBrowserResearchProgress: (
    participantId: string,
    agentRunId: string,
  ) => Promise<BrowserResearchProgress>;
  prepareCandidatePair: (input: {
    participantId: string;
    authorization: RuntimeLeaseAuthorization;
  }) => Promise<{ id: string; status: string } | null>;
  evaluateMyDirection: (input: {
    participantId: string;
    candidatePairId: string;
    authorization: RuntimeLeaseAuthorization;
    idempotencyKey: string;
  }) => Promise<{
    id: string;
    status: string;
    provider: string | null;
    result: unknown;
  }>;
  getCandidatePair: (
    participantId: string,
    candidatePairId: string,
  ) => ReturnType<typeof getCandidatePairForParticipant>;
  approveDisclosure: (input: {
    participantId: string;
    candidatePairId: string;
    authorization: RuntimeLeaseAuthorization;
    observationIds: string[];
  }) => Promise<{ id: string; observationIds: string[] }>;
  createIntroduction: (input: {
    participantId: string;
    candidatePairId: string;
    authorization: RuntimeLeaseAuthorization;
  }) => Promise<{ id: string; status: string }>;
  respondToIntroduction: (input: {
    participantId: string;
    introductionProposalId: string;
    authorization: RuntimeLeaseAuthorization;
    decision: "accepted" | "declined";
    block?: boolean;
  }) => ReturnType<typeof respondToIntroductionProposal>;
  getIntroduction: (
    participantId: string,
    introductionProposalId: string,
  ) => ReturnType<typeof getIntroductionProposalForParticipant>;
  submitOutcome: (input: {
    participantId: string;
    introductionProposalId: string;
    authorization: RuntimeLeaseAuthorization;
    outcome: unknown;
  }) => ReturnType<typeof submitIntroductionOutcome>;
  getOwnOutcome: (
    participantId: string,
    introductionProposalId: string,
  ) => ReturnType<typeof getOwnIntroductionOutcome>;
  listPersonalMemories: (
    participantId: string,
  ) => ReturnType<typeof listParticipantMemories>;
  reviewMemory: (input: {
    participantId: string;
    memoryId: string;
    authorization: RuntimeLeaseAuthorization;
    decision: "approve" | "edit" | "forget";
    editedSummary?: string;
  }) => ReturnType<typeof reviewPersonalMemory>;
  reviewObservation: (input: {
    participantId: string;
    observationId: string;
    decision: "approve" | "edit" | "set_visibility" | "forget";
    editedClaim?: string;
    visibility?: "private" | "shareable";
  }) => ReturnType<typeof reviewObservation>;
  exportAgent: (
    participantId: string,
  ) => ReturnType<typeof buildPortableAgentExport>;
  deleteAgent: (input: {
    participantId: string;
    authorization: RuntimeLeaseAuthorization;
    confirmation: "DELETE MY SYLLA AGENT";
  }) => ReturnType<typeof deletePortableAgent>;
  startRun: (input: {
    participantId: string;
    authorization: RuntimeLeaseAuthorization;
    idempotencyKey: string;
    purpose: string;
    backgroundContinuationAllowed: boolean;
    fallbackBudgetCredits: number;
  }) => Promise<AgentRunView>;
  checkpointRun: (input: {
    participantId: string;
    agentRunId: string;
    authorization: RuntimeLeaseAuthorization;
    checkpoint: VisibleRunCheckpoint;
  }) => Promise<AgentRunView>;
  yieldRun: (input: {
    participantId: string;
    agentRunId: string;
    authorization: RuntimeLeaseAuthorization;
  }) => Promise<AgentRunView>;
  executeFallback: (input: {
    participantId: string;
    agentRunId: string;
  }) => Promise<{ executed: boolean; run: AgentRunView }>;
  getRun: (participantId: string, agentRunId: string) => Promise<AgentRunView>;
  acknowledgeHandoff: (input: {
    participantId: string;
    agentRunId: string;
    authorization: RuntimeLeaseAuthorization;
  }) => Promise<AgentRunView>;
  openWorkspace: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
    idempotencyKey: string,
  ) => Promise<SyllaSessionState>;
  checkpointWorkspace: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
    idempotencyKey: string,
  ) => Promise<SyllaSessionState>;
  pauseWorkspace: (
    participantId: string,
    authorization: RuntimeLeaseAuthorization,
    idempotencyKey: string,
  ) => Promise<SyllaSessionState>;
};

const defaultServices: SyllaMcpServices = {
  async bootstrapAgent(participantId, input) {
    await updatePortableAgent(participantId, input);
    return loadSessionState(participantId);
  },
  completeSetup: completeConversationalSetup,
  loadState: loadSessionState,
  proposeMemory: proposeConversationMemory,
  getBilling: getBillingSummary,
  getConversationProfile,
  prepareConversationBrief,
  updateConversationProfile,
  startMission: (participantId, clientId, mission) =>
    startMission({ participantId, clientId, mission }),
  getMission,
  approveMission: (participantId, missionId, confirmation) =>
    approveMission({ participantId, missionId, confirmation }),
  continueMission: (participantId, clientId, missionId) =>
    continueMission({ participantId, clientId, missionId }),
  operateBrowser: (participantId, clientId, operation) =>
    operateInteractiveBrowserMission({
      participantId,
      clientId,
      operation,
    }),
  cancelMission: (participantId, missionId, confirmation) =>
    cancelMission({ participantId, missionId, confirmation }),
  acquireLease: acquireRuntimeLease,
  heartbeatLease: heartbeatRuntimeLease,
  releaseLease: releaseRuntimeLease,
  prepareBrowserResearch,
  researchNextBrowserSource,
  getBrowserResearchProgress,
  async prepareCandidatePair(input) {
    await requireRuntimeLease(input.participantId, input.authorization);
    const shortlist = await getCandidateShortlist(input.participantId, 1);
    const candidate = shortlist.candidates[0];
    if (!candidate) return null;
    const pair = await reserveCandidatePair({
      subjectParticipantId: input.participantId,
      candidateParticipantId: candidate.participantId,
    });
    return { id: pair.id, status: pair.status };
  },
  async evaluateMyDirection(input) {
    await requireRuntimeLease(input.participantId, input.authorization);
    const evaluation = await evaluatePairDirection({
      candidatePairId: input.candidatePairId,
      subjectParticipantId: input.participantId,
      idempotencyKey: input.idempotencyKey,
      orchestrator: "host_requested_sandbox",
    });
    return {
      id: evaluation.id,
      status: evaluation.status,
      provider: evaluation.provider,
      result: evaluation.result,
    };
  },
  getCandidatePair: getCandidatePairForParticipant,
  async approveDisclosure(input) {
    const envelope = await approveDisclosureEnvelope(input);
    return { id: envelope.id, observationIds: envelope.observationIds };
  },
  async createIntroduction(input) {
    const proposal = await createIntroductionProposal(input);
    return { id: proposal.id, status: proposal.status };
  },
  respondToIntroduction: respondToIntroductionProposal,
  getIntroduction: getIntroductionProposalForParticipant,
  submitOutcome: submitIntroductionOutcome,
  getOwnOutcome: getOwnIntroductionOutcome,
  listPersonalMemories: listParticipantMemories,
  reviewMemory: reviewPersonalMemory,
  reviewObservation,
  exportAgent: buildPortableAgentExport,
  deleteAgent: deletePortableAgent,
  startRun: startAgentRun,
  checkpointRun: checkpointAgentRun,
  yieldRun: yieldAgentRunToBackground,
  executeFallback: executeFallbackOnce,
  getRun: getAgentRun,
  acknowledgeHandoff: acknowledgeAgentRunHandoff,
  async openWorkspace(participantId, authorization, idempotencyKey) {
    return (
      await openParticipantWorkspace(participantId, {
        authorization,
        idempotencyKey,
      })
    ).state;
  },
  checkpointWorkspace(participantId, authorization, idempotencyKey) {
    return checkpointParticipantWorkspace(participantId, {
      authorization,
      idempotencyKey,
    });
  },
  pauseWorkspace(participantId, authorization, idempotencyKey) {
    return pauseParticipantWorkspace(participantId, {
      authorization,
      idempotencyKey,
    });
  },
};

function result<T extends Record<string, unknown>>(value: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function portableAgent(state: SyllaSessionState) {
  return {
    userId: state.identity.userId,
    agentId: state.identity.agentId,
    name: state.agentName,
    focus: state.focus,
    stage: state.stage,
    portable: true as const,
    workspaceStatus: state.workspace?.status ?? "unprovisioned",
    needsNaming: !state.agentName,
  };
}

const runIdSchema = z.string().trim().min(8).max(120);
const leaseTokenSchema = z.string().trim().min(32).max(200);
const idempotencyKeySchema = z.string().trim().min(8).max(160);
const agentRunIdSchema = z.uuid();
const checkpointSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  completedActions: z.array(z.string().trim().min(1).max(160)).max(20),
  nextAction: z.string().trim().min(1).max(240).nullable(),
  evidenceRefs: z.array(z.string().trim().min(1).max(240)).max(20),
});
const browserSourceSchema = z.object({
  url: z.url(),
  label: z.string().trim().min(1).max(120).optional(),
});

function leaseAuthorization(
  clientId: string,
  input: { runId: string; leaseToken: string },
): RuntimeLeaseAuthorization {
  return { clientId, runId: input.runId, leaseToken: input.leaseToken };
}

function entitlementContinuation(error: EntitlementRequiredError) {
  return result({
    allowed: false,
    reason: "insufficient_entitlement",
    plan: error.summary,
    checkout: {
      url: error.checkoutUrl,
      hosted: true,
      acceptsPaymentDataInMcp: false,
    },
  });
}

function companionOperationKey(
  participantId: string,
  requestId: string,
  operation: string,
) {
  return `sylla:${createHash("sha256")
    .update(`${participantId}:${requestId}:${operation}`)
    .digest("hex")}`;
}

export function createSyllaMcpServer(
  context: { participantId: string; clientId: string; scopes?: string[] },
  services: SyllaMcpServices = defaultServices,
) {
  const { participantId, clientId } = context;
  const server = new McpServer(
    { name: "sylla", version: "0.6.0" },
    {
      instructions:
        "Sylla is the user's persistent personal agent layer. At the start of a Sylla-enabled conversation, recover the agent with sylla_bootstrap_agent, then call sylla_prepare_conversation with a short description of the current topic before the first substantial reply. Treat its brief as silent behavioral guidance: never recite the profile or list memories to prove recall. Answer the actual point first. Default to two to four sentences, ask at most one genuine question, and do not end every reply with an offer or menu. Avoid canned phrases such as 'Certainly!', 'I'd be happy to help', 'I understand how you feel', and 'As an AI'. Use approved personal detail only when it genuinely improves the response. Be warm without claiming human feelings, consciousness, exclusivity, or dependence. If setup is incomplete, use sylla_get_setup_guide and collect required consent in brief plain language before calling sylla_complete_setup; the web app is optional. For open-ended work, prefer sylla_start_mission and let Sylla select Browser/Sandbox/Desktop resources; follow its private conversationCue without exposing statuses or provider mechanics. If the participant names a familiar website without pasting its URL, use that service's canonical HTTPS entry as the proposed mission source and make the exact site clear at approval. For an approved operate_web_account mission, call sylla_continue_mission once to observe the page, then keep choosing referenced controls with sylla_act_on_web until the outcome is complete or Sylla reports a real human checkpoint. Do not ask the participant to configure APIs or translate their goal into browser steps. Keep Solari, leases, credits, selectors, and internal state invisible unless the participant asks. Never ask for passwords, one-time codes, or payment credentials in chat. Use sylla_tune_conversation only for preferences the participant explicitly states. Use sylla_remember only when the participant explicitly asks you to remember something, and say plainly that it remains a proposal until approved. Prefer sylla_research and sylla_find_private_introduction for their exact flagship flows; lower-level tools exist for advanced recovery. Never reveal another participant's identity, private context, decision, or evaluation rationale before Sylla reports mutual acceptance.",
    },
  );

  server.registerTool(
    "sylla_bootstrap_agent",
    {
      title: "Open my Sylla agent",
      description:
        "Idempotently create or recover the caller's portable Sylla agent. Use this at the beginning of a Sylla-enabled conversation. A name and current focus are optional; never invent either for the user.",
      inputSchema: z.object({
        agentName: z.string().trim().min(1).max(40).optional(),
        focus: z.string().trim().min(3).max(280).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const state = await services.bootstrapAgent(participantId, input);
      const conversationProfile = await services.getConversationProfile(
        participantId,
      );
      return result({
        agent: portableAgent(state),
        conversationProfile,
        setupRequired: state.stage === "consent",
        nextStep:
          state.stage === "consent"
            ? "Use sylla_get_setup_guide and complete setup conversationally. The participant does not need to open the web app."
            : state.stage === "new"
              ? "The agent is configured. Ask for one to three public sources, then use sylla_research."
              : "Recall approved context with sylla_get_agent_context.",
      });
    },
  );

  server.registerTool(
    "sylla_prepare_conversation",
    {
      title: "Prepare a natural conversation with me",
      description:
        "Return a compact private behavior brief for this conversation: the participant's explicit voice preferences, a few relevant approved memories, and a natural response shape. Call before the first substantial reply and again only when the topic changes materially. Pass a short topic description, never a transcript. Use the brief silently; do not quote it or list memories to prove recall.",
      inputSchema: conversationBriefInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      result({
        conversation: await services.prepareConversationBrief(
          participantId,
          input,
        ),
      }),
  );

  server.registerTool(
    "sylla_tune_conversation",
    {
      title: "Tune how my agent talks with me",
      description:
        "Persist only conversation preferences the participant explicitly states, such as shorter replies, more direct disagreement, less reassurance, or dry humor. Never infer a style preference from demographics, a single mood, or an unapproved transcript. Summarize the exact change naturally after saving it.",
      inputSchema: conversationProfileInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      result({
        conversationProfile: await services.updateConversationProfile(
          participantId,
          input,
        ),
        conversationCue:
          "Acknowledge the preference in one plain sentence. Do not restate every profile field.",
      }),
  );

  server.registerTool(
    "sylla_get_setup_guide",
    {
      title: "See what my agent still needs",
      description:
        "Return the caller's current setup state, exact permission statements, and missing information. Use this to onboard the participant naturally in chat without sending them to the Sylla web app.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const state = await services.loadState(participantId);
      return result({
        agent: portableAgent(state),
        setupComplete: state.stage !== "consent" && state.stage !== "withdrawn",
        current: {
          displayName: state.participation.displayName,
          availability: state.participation.availability,
          consentedAt: state.participation.consentedAt,
          backgroundContinuationAllowed:
            state.participation.backgroundContinuationAllowed,
        },
        required: {
          displayName: "How other people may know the participant",
          agentName: "The participant's own name for their personal agent",
          focus: "What the agent should understand or help with now",
          availability:
            "One to five future windows when a private introduction could happen, including timezone",
          policyVersion: PARTICIPATION_POLICY_VERSION,
          permissions: PARTICIPATION_PERMISSION_COPY,
        },
        consentRule:
          "Read or faithfully summarize every permission and obtain an explicit answer to each. Never infer consent from profile data, previous conversation, or a generic desire to use Sylla.",
      });
    },
  );

  server.registerTool(
    "sylla_complete_setup",
    {
      title: "Complete my Sylla setup in this conversation",
      description:
        "Configure the portable agent and record participation permissions without requiring the web app. Call only after the participant explicitly confirms they are 18+, public-source research, private proposed-memory storage, matchmaking with approved shareable context, the host-data boundary, and each availability window. Background continuation remains optional.",
      inputSchema: z.object({
        displayName: z.string().trim().min(1).max(80),
        agentName: z.string().trim().min(1).max(40),
        focus: z.string().trim().min(3).max(280),
        policyVersion: z.literal(PARTICIPATION_POLICY_VERSION),
        ageConfirmed: z.literal(true),
        publicSourceResearch: z.literal(true),
        privateMemoryStorage: z.literal(true),
        matchmaking: z.literal(true),
        hostDataBoundary: z.literal(true),
        backgroundContinuation: z.boolean().default(false),
        availability: z
          .array(
            z
              .object({
                startsAt: z.iso.datetime(),
                endsAt: z.iso.datetime(),
                timezone: z.string().trim().min(1).max(80),
              })
              .refine(
                (window) =>
                  new Date(window.endsAt) > new Date(window.startsAt),
                "Availability must end after it starts.",
              ),
          )
          .min(1)
          .max(5),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const state = await services.completeSetup(participantId, input);
      return result({
        agent: portableAgent(state),
        participation: state.participation,
        setupComplete: true,
        nextStep:
          "Continue naturally. Ask whether the participant wants to share one to three public URLs for evidence-backed research; this is optional and can happen later.",
      });
    },
  );

  server.registerTool(
    "sylla_get_agent_context",
    {
      title: "Recall my approved Sylla context",
      description:
        "Return the caller's approved portable memories and optionally pending proposals. Pending proposals are not memories and must never be treated as approved.",
      inputSchema: z.object({
        includePending: z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ includePending }) => {
      const [state, personalMemories] = await Promise.all([
        services.loadState(participantId),
        services.listPersonalMemories(participantId),
      ]);
      const observations = state.observations.filter(
        (observation) => includePending || observation.status !== "pending",
      );

      return result({
        agent: portableAgent(state),
        memories: observations,
        relationshipMemories: personalMemories.filter(
          (memory) => includePending || memory.status !== "proposed",
        ),
        memoryPolicy: {
          pendingIsApproved: false,
          approvalRequired: true,
          sourceCount: state.sources.length,
        },
      });
    },
  );

  server.registerTool(
    "sylla_start_mission",
    {
      title: "Start work for me",
      description:
        "Turn the participant's natural objective into a durable mission. Sylla automatically selects a product capability, Browser/Sandbox/Desktop resources, a bounded plan, and the required approval level. The participant should describe outcomes, not infrastructure. Use URLs they supplied; when they clearly name a familiar website without a URL, use its canonical HTTPS entry and make that exact site clear before approval.",
      inputSchema: startMissionSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      result({
        mission: await services.startMission(participantId, clientId, input),
        abstraction:
          "The participant manages intention and permission; Sylla manages execution; Solari remains invisible infrastructure.",
      }),
  );

  server.registerTool(
    "sylla_get_mission",
    {
      title: "Check my mission",
      description:
        "Read a durable mission's objective, capability, plan, resource choice, progress, result, and next action without exposing provider credentials or raw runtime capabilities.",
      inputSchema: z.object({ missionId: z.uuid() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ missionId }) =>
      result({ mission: await services.getMission(participantId, missionId) }),
  );

  server.registerTool(
    "sylla_approve_mission",
    {
      title: "Approve a consequential mission",
      description:
        "Release a mission-level approval gate only after the participant has reviewed the objective, sources, resource plan, risk level, and expected external effect and explicitly approved this specific mission. This never widens its stored scope.",
      inputSchema: z.object({
        missionId: z.uuid(),
        confirmation: z.literal("I APPROVE THIS MISSION"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ missionId, confirmation }) =>
      result({
        mission: await services.approveMission(
          participantId,
          missionId,
          confirmation,
        ),
      }),
  );

  server.registerTool(
    "sylla_continue_mission",
    {
      title: "Continue my mission",
      description:
        "Execute the next bounded mission stage. Sylla selects and manages the Solari runtime, lease, cost reservation, cleanup, progress records, and safety boundary. Call only when the mission's nextAction says it is ready; never fabricate approval or missing URLs.",
      inputSchema: z.object({ missionId: z.uuid() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ missionId }) => {
      try {
        return result({
          mission: await services.continueMission(
            participantId,
            clientId,
            missionId,
          ),
        });
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "sylla_act_on_web",
    {
      title: "Continue a web task",
      description:
        "Operate the current approved website for an interactive mission. Read the latest observation, choose one or more referenced controls, and continue until the participant's requested outcome is complete. Sylla preserves the authenticated browser profile between calls. Do not narrate refs, selectors, sessions, or Solari. Never put a password or one-time code in an action; stop when Sylla reports a human checkpoint.",
      inputSchema: interactiveBrowserInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        return result({
          mission: await services.operateBrowser(
            participantId,
            clientId,
            input,
          ),
        });
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "sylla_cancel_mission",
    {
      title: "Cancel my mission",
      description:
        "Stop a mission from continuing. Call only after the participant explicitly asks to cancel this specific mission. Already completed external actions cannot be undone by cancellation.",
      inputSchema: z.object({
        missionId: z.uuid(),
        confirmation: z.literal("CANCEL THIS MISSION"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ missionId, confirmation }) =>
      result({
        mission: await services.cancelMission(
          participantId,
          missionId,
          confirmation,
        ),
      }),
  );

  server.registerTool(
    "sylla_remember",
    {
      title: "Remember something about me",
      description:
        "Create a short memory proposal from something the participant explicitly asked Sylla to remember. The proposal is not approved memory until the participant reviews it in Sylla. Never send a raw transcript or infer sensitive facts.",
      inputSchema: z.object({
        summary: z.string().trim().min(3).max(280),
        visibility: z.enum(["private", "shareable"]).default("private"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ summary, visibility }) =>
      result({
        memory: await services.proposeMemory({
          participantId,
          summary,
          visibility,
        }),
        nextStep:
          "Tell the participant this is waiting for their approval in Sylla Memory.",
      }),
  );

  server.registerTool(
    "sylla_review_observation",
    {
      title: "Review one of my Sylla memory proposals",
      description:
        "Approve, correct, change the privacy of, or forget one research or conversation memory. Call only for a specific memory the participant has just reviewed and explicitly chosen. Approval makes pending memory available to future agent reasoning; shareable memory may be used in private matching.",
      inputSchema: z.object({
        observationId: z.uuid(),
        decision: z.enum(["approve", "edit", "set_visibility", "forget"]),
        editedClaim: z.string().trim().min(3).max(600).optional(),
        visibility: z.enum(["private", "shareable"]).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ observationId, decision, editedClaim, visibility }) => {
      const state = await services.reviewObservation({
        participantId,
        observationId,
        decision,
        editedClaim,
        visibility,
      });
      return result({
        agent: portableAgent(state),
        observation:
          state.observations.find((item) => item.id === observationId) ?? null,
        forgotten: decision === "forget",
        pendingCount: state.observations.filter(
          (item) => item.status === "pending",
        ).length,
      });
    },
  );

  server.registerTool(
    "sylla_research",
    {
      title: "Research approved sources for me",
      description:
        "High-level companion action: research one to three public URLs the participant explicitly provided, preserve evidence with Solari Browser, and return memory proposals for review. Sylla manages the runtime lease and durable checkpoints internally.",
      inputSchema: z.object({
        requestId: idempotencyKeySchema,
        focus: z.string().trim().min(3).max(280),
        sources: z.array(browserSourceSchema).min(1).max(3),
        backgroundContinuationAllowed: z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ requestId, focus, sources, backgroundContinuationAllowed }) => {
      const runKey = companionOperationKey(participantId, requestId, "research");
      const runId = `companion-research-${runKey.slice(6, 38)}`;
      const lease = await services.acquireLease({
        participantId,
        clientId,
        runId,
        purpose: "Research participant-approved public sources",
        durationSeconds: 300,
      });
      const authorization = leaseAuthorization(clientId, {
        runId,
        leaseToken: lease.leaseToken,
      });
      try {
        let progress = await services.prepareBrowserResearch({
          participantId,
          authorization,
          idempotencyKey: companionOperationKey(
            participantId,
            requestId,
            "research:prepare",
          ),
          focus,
          sources,
          backgroundContinuationAllowed,
          fallbackBudgetCredits: backgroundContinuationAllowed ? sources.length : 0,
        });
        for (
          let index = 0;
          index < sources.length &&
          progress.nextSourceId &&
          progress.run.status === "host_orchestrated";
          index += 1
        ) {
          progress = await services.researchNextBrowserSource({
            participantId,
            agentRunId: progress.run.id,
            authorization,
            idempotencyKey: companionOperationKey(
              participantId,
              requestId,
              `research:source:${index + 1}`,
            ),
          });
        }
        return result({
          progress,
          memoryPolicy: "Evidence and inferences remain proposals until the participant approves them.",
        });
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      } finally {
        await services.releaseLease(participantId, authorization).catch(() => undefined);
      }
    },
  );

  server.registerTool(
    "sylla_find_private_introduction",
    {
      title: "Find someone I may genuinely want to meet",
      description:
        "High-level flagship action: privately shortlist one eligible opted-in participant and evaluate only the caller's direction. Returns no identity or private rationale. A proposal can advance only after the other agent independently recommends the match and both humans separately consent.",
      inputSchema: z.object({ requestId: idempotencyKeySchema }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ requestId }) => {
      const runKey = companionOperationKey(participantId, requestId, "introduction");
      const runId = `companion-introduction-${runKey.slice(6, 38)}`;
      const lease = await services.acquireLease({
        participantId,
        clientId,
        runId,
        purpose: "Evaluate a private introduction candidate",
        durationSeconds: 300,
      });
      const authorization = leaseAuthorization(clientId, {
        runId,
        leaseToken: lease.leaseToken,
      });
      try {
        const pair = await services.prepareCandidatePair({
          participantId,
          authorization,
        });
        if (!pair) {
          return result({
            status: "no_candidate_yet",
            message:
              "No eligible mutual possibility is ready yet. Sylla will not lower the consent or availability bar.",
          });
        }
        await services.evaluateMyDirection({
          participantId,
          candidatePairId: pair.id,
          authorization,
          idempotencyKey: companionOperationKey(
            participantId,
            requestId,
            "introduction:my-direction",
          ),
        });
        return result({
          status: "waiting_for_other_agent",
          candidatePair: await services.getCandidatePair(participantId, pair.id),
          privacy:
            "No identity, private context, decision, or evaluation rationale is disclosed before the bilateral gates complete.",
        });
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      } finally {
        await services.releaseLease(participantId, authorization).catch(() => undefined);
      }
    },
  );

  server.registerTool(
    "sylla_get_agent_workspace",
    {
      title: "Inspect my Sylla workspace",
      description:
        "Return lifecycle metadata for the caller's persistent private agent home. This never exposes Solari stream capabilities or provider credentials.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const state = await services.loadState(participantId);
      return result({
        agentId: state.identity.agentId,
        workspace: state.workspace
          ? {
              id: state.workspace.id,
              status: state.workspace.status,
              provider: state.workspace.provider,
              hasDesktop: Boolean(state.workspace.sessionId),
              hasDurableVolume: Boolean(state.workspace.volumeId),
              hasRecoverySnapshot: Boolean(state.workspace.snapshotId),
              lastActiveAt: state.workspace.lastActiveAt,
              pausedAt: state.workspace.pausedAt,
            }
          : null,
      });
    },
  );

  server.registerTool(
    "sylla_get_plan",
    {
      title: "Check my Sylla plan and work credits",
      description:
        "Return the caller's Sylla entitlement, available work credits, and current operation estimates. Work credits cover Sylla-managed runtime; they are separate from the host LLM subscription.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      result({
        plan: await services.getBilling(participantId),
        operationEstimates: OPERATION_CREDITS,
        paymentBoundary:
          "Payment credentials are accepted only by Sylla's hosted checkout, never through MCP.",
      }),
  );

  server.registerTool(
    "sylla_acquire_agent_lease",
    {
      title: "Acquire my Sylla agent run",
      description:
        "Acquire the exclusive short-lived orchestration lease before operating the agent's Desktop. Use a unique runId for this host conversation. Another run cannot operate the same agent until the lease is released or expires.",
      inputSchema: z.object({
        runId: runIdSchema,
        purpose: z.string().trim().min(3).max(160),
        durationSeconds: z.number().int().min(30).max(300).default(90),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ runId, purpose, durationSeconds }) => {
      const lease = await services.acquireLease({
        participantId,
        clientId,
        runId,
        purpose,
        durationSeconds,
      });
      return result({
        lease: {
          runId: lease.runId,
          leaseToken: lease.leaseToken,
          expiresAt: lease.expiresAt,
          heartbeatRequired: true,
        },
      });
    },
  );

  server.registerTool(
    "sylla_heartbeat_agent_lease",
    {
      title: "Keep my Sylla agent run active",
      description:
        "Renew the current run's exclusive lease while the host is actively orchestrating work.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        durationSeconds: z.number().int().min(30).max(300).default(90),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ runId, leaseToken, durationSeconds }) =>
      result({
        lease: await services.heartbeatLease(
          participantId,
          leaseAuthorization(clientId, { runId, leaseToken }),
          durationSeconds,
        ),
      }),
  );

  server.registerTool(
    "sylla_release_agent_lease",
    {
      title: "Release my Sylla agent run",
      description:
        "Release the current run's exclusive orchestration lease when work stops or transfers. This does not delete the agent or its persistent home.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ runId, leaseToken }) => {
      await services.releaseLease(
        participantId,
        leaseAuthorization(clientId, { runId, leaseToken }),
      );
      return result({ released: true });
    },
  );

  server.registerTool(
    "sylla_start_agent_run",
    {
      title: "Start durable Sylla work",
      description:
        "Create an idempotent durable run under the active host lease. The run stores only explicit resumable state, never hidden reasoning or an unreviewed private debrief. Background continuation is optional and limited to creating a reconnect summary in this version.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
        purpose: z.string().trim().min(3).max(240),
        backgroundContinuationAllowed: z.boolean().default(false),
        fallbackBudgetCredits: z.number().int().min(0).max(25).default(0),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({
      runId,
      leaseToken,
      idempotencyKey,
      purpose,
      backgroundContinuationAllowed,
      fallbackBudgetCredits,
    }) =>
      result({
        run: await services.startRun({
          participantId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          idempotencyKey,
          purpose,
          backgroundContinuationAllowed,
          fallbackBudgetCredits,
        }),
        fallbackPolicy: {
          approvedTaskType: "prepare_reconnect_summary",
          consequentialActionsAllowed: false,
          rawDebriefStored: false,
        },
      }),
  );

  server.registerTool(
    "sylla_prepare_browser_research",
    {
      title: "Prepare approved Solari Browser research",
      description:
        "Create a durable Browser run from one to three URLs the participant explicitly approved. This resets the current research proposals, stores the exact URL scope, and does not visit a page yet.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
        agentName: z.string().trim().min(1).max(40).optional(),
        focus: z.string().trim().min(3).max(280),
        sources: z.array(browserSourceSchema).min(1).max(3),
        backgroundContinuationAllowed: z.boolean().default(false),
        fallbackBudgetCredits: z.number().int().min(0).max(3).default(0),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({
      runId,
      leaseToken,
      idempotencyKey,
      agentName,
      focus,
      sources,
      backgroundContinuationAllowed,
      fallbackBudgetCredits,
    }) =>
      result({
        progress: await services.prepareBrowserResearch({
          participantId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          idempotencyKey,
          agentName,
          focus,
          sources,
          backgroundContinuationAllowed,
          fallbackBudgetCredits,
        }),
        executionPolicy: {
          visitsPerToolCall: 1,
          approvedUrlsOnly: true,
          automaticDuplicateVisits: false,
          backgroundContinuationBounded: backgroundContinuationAllowed,
        },
      }),
  );

  server.registerTool(
    "sylla_research_next_source",
    {
      title: "Research the next approved source",
      description:
        "Visit exactly one unfinished URL from a prepared run with Solari Browser, persist its evidence, update memory proposals, and checkpoint progress. Completed or ambiguous sources are never revisited automatically.",
      inputSchema: z.object({
        agentRunId: agentRunIdSchema,
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ agentRunId, runId, leaseToken, idempotencyKey }) => {
      try {
        return result({
          progress: await services.researchNextBrowserSource({
            participantId,
            agentRunId,
            authorization: leaseAuthorization(clientId, { runId, leaseToken }),
            idempotencyKey,
          }),
        });
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "sylla_get_research_progress",
    {
      title: "Read durable Browser research progress",
      description:
        "Return the exact approved source scope, completed evidence state, next unfinished source, and any reconnect handoff. This never performs a Browser visit.",
      inputSchema: z.object({ agentRunId: agentRunIdSchema }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentRunId }) =>
      result({
        progress: await services.getBrowserResearchProgress(
          participantId,
          agentRunId,
        ),
      }),
  );

  server.registerTool(
    "sylla_checkpoint_agent_run",
    {
      title: "Checkpoint durable Sylla work",
      description:
        "Persist a concise, participant-visible checkpoint for the current run. Include completed actions, the next action, and opaque evidence references; do not send chain of thought, credentials, or raw private debrief text.",
      inputSchema: z.object({
        agentRunId: agentRunIdSchema,
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        checkpoint: checkpointSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ agentRunId, runId, leaseToken, checkpoint }) =>
      result({
        run: await services.checkpointRun({
          participantId,
          agentRunId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          checkpoint,
        }),
      }),
  );

  server.registerTool(
    "sylla_prepare_candidate_pair",
    {
      title: "Prepare one eligible introduction hypothesis",
      description:
        "Deterministically reserve one non-identifying candidate pair after enforcing same-event consent, availability, blocks, prior declines, pair conflicts, and approved shareable-context rules. This does not reveal identity, recommend, disclose, or introduce anyone.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ runId, leaseToken }) =>
      result({
        pair: await services.prepareCandidatePair({
          participantId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
        }),
        gate: {
          identityRevealed: false,
          recommendationMade: false,
          introductionCreated: false,
        },
      }),
  );

  server.registerTool(
    "sylla_evaluate_my_direction",
    {
      title: "Evaluate my direction in an isolated Sandbox",
      description:
        "Run one directional candidate hypothesis through the Solari Sandbox boundary. The job receives this participant's approved context and only the candidate's approved shareable context. The structured result cites authorized observation IDs and cannot accept or disclose an introduction.",
      inputSchema: z.object({
        candidatePairId: z.uuid(),
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ candidatePairId, runId, leaseToken, idempotencyKey }) => {
      try {
        return result({
          evaluation: await services.evaluateMyDirection({
            participantId,
            candidatePairId,
            authorization: leaseAuthorization(clientId, { runId, leaseToken }),
            idempotencyKey,
          }),
          humanGate: "No disclosure or introduction occurs from this result.",
        });
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "sylla_get_candidate_pair",
    {
      title: "Read my candidate-pair gate",
      description:
        "Read a privacy-preserving pair status. The other participant's identity, private context, rationale, and decline decision are never returned.",
      inputSchema: z.object({ candidatePairId: z.uuid() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ candidatePairId }) =>
      result({
        pair: await services.getCandidatePair(participantId, candidatePairId),
      }),
  );

  server.registerTool(
    "sylla_approve_my_disclosure",
    {
      title: "Approve what my introduction may disclose",
      description:
        "Human-controlled gate: approve one to five of the caller's confirmed shareable observations for this recommended pair. An internal fallback lease cannot call this tool. Approval does not reveal either participant's identity or create a meeting.",
      inputSchema: z.object({
        candidatePairId: z.uuid(),
        observationIds: z.array(z.uuid()).min(1).max(5),
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ candidatePairId, observationIds, runId, leaseToken }) =>
      result({
        disclosure: await services.approveDisclosure({
          participantId,
          candidatePairId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          observationIds,
        }),
        gate: {
          identityRevealed: false,
          meetingCreated: false,
          humanHostRequired: true,
        },
      }),
  );

  server.registerTool(
    "sylla_create_introduction_proposal",
    {
      title: "Prepare a private introduction proposal",
      description:
        "After both participants separately approve their disclosure envelopes, prepare a non-identifying proposal using their overlapping availability and the event's public meeting area. This does not reveal identity or the meeting details until both accept.",
      inputSchema: z.object({
        candidatePairId: z.uuid(),
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ candidatePairId, runId, leaseToken }) =>
      result({
        proposal: await services.createIntroduction({
          participantId,
          candidatePairId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
        }),
        gate: { identityRevealed: false, mutualAcceptanceRequired: true },
      }),
  );

  server.registerTool(
    "sylla_respond_to_introduction",
    {
      title: "Privately answer an introduction proposal",
      description:
        "Human-controlled gate: privately accept or decline a proposal. Declining may also block future matching with this person. The other person's decision is never exposed; identity and meeting details appear only after both independently accept. Internal fallback cannot answer.",
      inputSchema: z.object({
        introductionProposalId: z.uuid(),
        decision: z.enum(["accepted", "declined"]),
        block: z.boolean().default(false),
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ introductionProposalId, decision, block, runId, leaseToken }) =>
      result({
        introduction: await services.respondToIntroduction({
          participantId,
          introductionProposalId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          decision,
          block,
        }),
      }),
  );

  server.registerTool(
    "sylla_get_introduction",
    {
      title: "Read my private introduction state",
      description:
        "Read the caller's privacy-filtered proposal. Before mutual acceptance it contains only the other person's approved preview, never their identity, response, meeting details, private observations, or evaluation rationale.",
      inputSchema: z.object({ introductionProposalId: z.uuid() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ introductionProposalId }) =>
      result({
        introduction: await services.getIntroduction(
          participantId,
          introductionProposalId,
        ),
      }),
  );

  server.registerTool(
    "sylla_submit_my_introduction_outcome",
    {
      title: "Submit my private introduction outcome",
      description:
        "Human-controlled post-meeting gate. Submit only the explicit structured answers and zero to three short proposed memories the participant has reviewed. Never send a transcript or raw debrief. The other participant's outcome is not returned.",
      inputSchema: z.object({
        introductionProposalId: z.uuid(),
        outcome: structuredOutcomeSchema,
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ introductionProposalId, outcome, runId, leaseToken }) =>
      result({
        submission: await services.submitOutcome({
          participantId,
          introductionProposalId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          outcome,
        }),
        retentionPolicy: {
          rawDebriefAccepted: false,
          rawDebriefPersisted: false,
          proposedMemoriesRequireReview: true,
        },
      }),
  );

  server.registerTool(
    "sylla_get_my_introduction_outcome",
    {
      title: "Read my introduction outcome",
      description:
        "Return only the caller's structured outcome for this introduction. The other participant's answers and debrief state are never exposed.",
      inputSchema: z.object({ introductionProposalId: z.uuid() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ introductionProposalId }) =>
      result({
        outcome: await services.getOwnOutcome(
          participantId,
          introductionProposalId,
        ),
      }),
  );

  server.registerTool(
    "sylla_review_my_memory",
    {
      title: "Approve, edit, or forget my proposed memory",
      description:
        "Human-controlled memory gate. Approve a distilled private proposal, replace it with the participant's edited wording, or permanently forget it. Proposed memory never affects future reasoning until approved or edited.",
      inputSchema: z.object({
        memoryId: z.uuid(),
        decision: z.enum(["approve", "edit", "forget"]),
        editedSummary: z.string().trim().min(3).max(280).optional(),
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ memoryId, decision, editedSummary, runId, leaseToken }) =>
      result({
        memory: await services.reviewMemory({
          participantId,
          memoryId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          decision,
          editedSummary,
        }),
      }),
  );

  server.registerTool(
    "sylla_export_my_agent",
    {
      title: "Export my portable Sylla agent",
      description:
        "Export the caller's canonical agent identity and approved state across Sylla event records. The export excludes pending or forgotten memory, raw debriefs, other participants' outcomes, provider credentials, and Solari capabilities.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => result({ export: await services.exportAgent(participantId) }),
  );

  if (context.scopes?.includes("sylla:delete")) {
    server.registerTool(
      "sylla_delete_my_agent",
    {
      title: "Permanently delete my Sylla agent",
      description:
        "Irreversibly delete the caller's canonical Sylla account, event-participation records, approved and proposed memory, outcomes, host connections, and Sylla-managed workspace resources. This requires a human-controlled host lease and the exact confirmation phrase. Export first if the participant wants a copy.",
      inputSchema: z.object({
        confirmation: z.literal("DELETE MY SYLLA AGENT"),
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ confirmation, runId, leaseToken }) =>
      result(
        await services.deleteAgent({
          participantId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
          confirmation,
        }),
      ),
    );
  }

  server.registerTool(
    "sylla_yield_agent_run",
    {
      title: "Yield Sylla work for safe continuation",
      description:
        "Mark the durable run as waiting and release the host lease. If the participant enabled bounded continuation, the Sylla controller may perform only the approved reconnect-summary task after the lease is gone.",
      inputSchema: z.object({
        agentRunId: agentRunIdSchema,
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ agentRunId, runId, leaseToken }) =>
      result({
        run: await services.yieldRun({
          participantId,
          agentRunId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
        }),
        leaseReleased: true,
      }),
  );

  server.registerTool(
    "sylla_attempt_agent_fallback",
    {
      title: "Attempt bounded Sylla fallback",
      description:
        "Ask Sylla's deterministic controller to claim the approved fallback task. It does nothing while a host lease is active, cannot exceed the run budget, cannot take consequential action, and can succeed only once.",
      inputSchema: z.object({ agentRunId: agentRunIdSchema }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentRunId }) =>
      result(
        await services.executeFallback({ participantId, agentRunId }),
      ),
  );

  server.registerTool(
    "sylla_get_agent_run",
    {
      title: "Read Sylla run and reconnect handoff",
      description:
        "Read the durable status, latest explicit checkpoint, and any auditable fallback handoff for this caller's agent run.",
      inputSchema: z.object({ agentRunId: agentRunIdSchema }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentRunId }) =>
      result({ run: await services.getRun(participantId, agentRunId) }),
  );

  server.registerTool(
    "sylla_acknowledge_agent_handoff",
    {
      title: "Acknowledge a Sylla reconnect handoff",
      description:
        "After acquiring a new host lease, acknowledge that the reconnecting host received the durable fallback summary. This never repeats the completed fallback task.",
      inputSchema: z.object({
        agentRunId: agentRunIdSchema,
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agentRunId, runId, leaseToken }) =>
      result({
        run: await services.acknowledgeHandoff({
          participantId,
          agentRunId,
          authorization: leaseAuthorization(clientId, { runId, leaseToken }),
        }),
      }),
  );

  server.registerTool(
    "sylla_open_agent_workspace",
    {
      title: "Open my Sylla agent home",
      description:
        "Create or resume the caller's persistent private Solari Desktop, attach its durable volume, materialize only approved memories, and checkpoint the result. This may consume Sylla runtime allowance and never returns a stream capability or provider credential.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ runId, leaseToken, idempotencyKey }) => {
      let state: SyllaSessionState;
      try {
        state = await services.openWorkspace(
          participantId,
          leaseAuthorization(clientId, { runId, leaseToken }),
          idempotencyKey,
        );
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
      return result({
        allowed: true,
        agent: portableAgent(state),
        workspace: state.workspace
          ? {
              id: state.workspace.id,
              status: state.workspace.status,
              hasDesktop: Boolean(state.workspace.sessionId),
              hasDurableVolume: Boolean(state.workspace.volumeId),
              hasRecoverySnapshot: Boolean(state.workspace.snapshotId),
            }
          : null,
        viewerPolicy:
          "Open Sylla's participant-authorized web workspace to view the live Desktop.",
      });
    },
  );

  server.registerTool(
    "sylla_checkpoint_agent_workspace",
    {
      title: "Checkpoint my Sylla agent home",
      description:
        "Create a recovery checkpoint of the caller's open private Desktop without exposing its files or stream capability.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ runId, leaseToken, idempotencyKey }) => {
      let state: SyllaSessionState;
      try {
        state = await services.checkpointWorkspace(
          participantId,
          leaseAuthorization(clientId, { runId, leaseToken }),
          idempotencyKey,
        );
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
      return result({
        allowed: true,
        workspaceStatus: state.workspace?.status ?? "unprovisioned",
        checkpointCreated: Boolean(state.workspace?.snapshotId),
      });
    },
  );

  server.registerTool(
    "sylla_pause_agent_workspace",
    {
      title: "Pause my Sylla agent home",
      description:
        "Checkpoint and pause the caller's Desktop to stop active compute while preserving its durable home for a later host or native Sylla app.",
      inputSchema: z.object({
        runId: runIdSchema,
        leaseToken: leaseTokenSchema,
        idempotencyKey: idempotencyKeySchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ runId, leaseToken, idempotencyKey }) => {
      let state: SyllaSessionState;
      try {
        state = await services.pauseWorkspace(
          participantId,
          leaseAuthorization(clientId, { runId, leaseToken }),
          idempotencyKey,
        );
      } catch (error) {
        if (error instanceof EntitlementRequiredError) {
          return entitlementContinuation(error);
        }
        throw error;
      }
      return result({
        allowed: true,
        workspaceStatus: state.workspace?.status ?? "unprovisioned",
        preserved: Boolean(state.workspace?.volumeId),
        hasRecoverySnapshot: Boolean(state.workspace?.snapshotId),
      });
    },
  );

  return server;
}
