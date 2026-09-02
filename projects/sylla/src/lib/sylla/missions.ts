import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import * as z from "zod/v4";

import { getDatabase } from "@/db";
import { agentMissions, missionSteps, runtimeLeases } from "@/db/schema";
import { assertPublicHttpUrl } from "@/lib/solari/url-policy";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import { recordAuditEvent } from "@/lib/sylla/participation";

export const missionCapabilities = [
  "research_public_topic",
  "compare_options",
  "investigate_person",
  "test_software",
  "prepare_meeting",
  "maintain_personal_workspace",
  "find_private_introduction",
  "operate_web_account",
] as const;

export type MissionCapability = (typeof missionCapabilities)[number];
export type MissionResource = "browser" | "sandbox" | "desktop" | "sylla";
export type MissionRisk =
  | "observe"
  | "prepare"
  | "external_action"
  | "sensitive"
  | "destructive";
export type MissionStatus =
  | "waiting_for_input"
  | "waiting_for_approval"
  | "ready"
  | "active"
  | "waiting_for_user"
  | "completed"
  | "canceled"
  | "failed";

const sourceSchema = z.object({
  url: z.url(),
  label: z.string().trim().min(1).max(120).optional(),
});

export const startMissionSchema = z.object({
  requestId: z.string().trim().min(8).max(160),
  objective: z.string().trim().min(3).max(800),
  requestedOutcome: z.string().trim().min(3).max(400).optional(),
  sources: z.array(sourceSchema).max(3).default([]),
  maxCredits: z.number().int().min(0).max(500).default(100),
  backgroundContinuationAllowed: z.boolean().default(false),
});

export type StartMissionInput = z.infer<typeof startMissionSchema>;

type MissionPlanStep = {
  sequence: number;
  title: string;
  resource: MissionResource;
  risk: MissionRisk;
};

export type MissionView = {
  id: string;
  objective: string;
  requestedOutcome: string | null;
  capability: MissionCapability;
  status: MissionStatus;
  riskLevel: MissionRisk;
  approvalRequired: boolean;
  approvedAt: string | null;
  constraints: {
    sourceUrls: Array<{ url: string; label?: string }>;
    maxCredits: number;
    backgroundContinuationAllowed: boolean;
  };
  resourcePlan: {
    primary: "browser" | "sandbox" | "desktop" | "none";
    supporting: Array<"browser" | "sandbox" | "desktop">;
    reason: string;
  };
  plan: MissionPlanStep[];
  steps: Array<MissionPlanStep & {
    id: string;
    status: string;
    output: Record<string, unknown> | null;
    providerExecutionRecorded: boolean;
    error: string | null;
  }>;
  result: Record<string, unknown> | null;
  lastError: string | null;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => {
    const phrase = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "i").test(
      value,
    );
  });
}

export function classifyMission(objective: string): MissionCapability {
  const value = objective.toLowerCase();
  if (
    includesAny(value, [
      "introduce me",
      "introduction",
      "match me",
      "someone to meet",
      "someone i may",
      "someone i would",
      "person to meet",
    ])
  ) {
    return "find_private_introduction";
  }
  if (
    includesAny(value, [
      "repository",
      " repo",
      "github",
      "run the tests",
      "test this code",
      "test this project",
      "build this project",
    ])
  ) {
    return "test_software";
  }
  if (
    includesAny(value, [
      "my workspace",
      "agent workspace",
      "workbench",
      "persistent desktop",
    ])
  ) {
    return "maintain_personal_workspace";
  }
  if (
    includesAny(value, [
      "send ",
      "post ",
      "publish ",
      "submit ",
      "book ",
      "reserve ",
      "purchase ",
      "buy ",
      "cancel ",
      "delete ",
    ])
  ) {
    return "operate_web_account";
  }
  if (includesAny(value, ["prepare me for", "meeting brief", "before i meet"])) {
    return "prepare_meeting";
  }
  if (includesAny(value, ["compare", "best option", "choose between", "shortlist"])) {
    return "compare_options";
  }
  if (includesAny(value, ["this person", "about them", "about him", "about her", "profile"])) {
    return "investigate_person";
  }
  return "research_public_topic";
}

export function classifyMissionRisk(objective: string): MissionRisk {
  const value = objective.toLowerCase();
  if (includesAny(value, ["delete ", "erase ", "close my account"])) {
    return "destructive";
  }
  if (includesAny(value, ["purchase ", "buy ", "pay ", "payment", "checkout"])) {
    return "sensitive";
  }
  if (
    includesAny(value, [
      "send ",
      "post ",
      "publish ",
      "submit ",
      "book ",
      "reserve ",
      "cancel ",
    ])
  ) {
    return "external_action";
  }
  if (includesAny(value, ["draft ", "prepare ", "test ", "build "])) {
    return "prepare";
  }
  return "observe";
}

export function buildMissionPlan(
  capability: MissionCapability,
  risk: MissionRisk,
): {
  resourcePlan: MissionView["resourcePlan"];
  plan: MissionPlanStep[];
} {
  if (capability === "find_private_introduction") {
    return {
      resourcePlan: {
        primary: "sandbox",
        supporting: [],
        reason: "Private directional evaluation needs an isolated boundary.",
      },
      plan: [
        { sequence: 1, title: "Apply consent and eligibility filters", resource: "sylla", risk: "observe" },
        { sequence: 2, title: "Evaluate one private direction", resource: "sandbox", risk: "observe" },
        { sequence: 3, title: "Wait for independent mutual consent", resource: "sylla", risk: "external_action" },
      ],
    };
  }
  if (capability === "test_software") {
    return {
      resourcePlan: {
        primary: "sandbox",
        supporting: ["browser"],
        reason: "Untrusted software should be inspected and tested in an isolated microVM.",
      },
      plan: [
        { sequence: 1, title: "Validate the approved repository", resource: "sylla", risk: "observe" },
        { sequence: 2, title: "Clone and inspect the project", resource: "sandbox", risk: "observe" },
        { sequence: 3, title: "Run the project's declared checks", resource: "sandbox", risk: "prepare" },
        { sequence: 4, title: "Summarize evidence and limitations", resource: "sylla", risk: "observe" },
      ],
    };
  }
  if (capability === "maintain_personal_workspace") {
    return {
      resourcePlan: {
        primary: "desktop",
        supporting: [],
        reason: "Durable visual work belongs in the agent's pausable private workspace.",
      },
      plan: [
        { sequence: 1, title: "Assemble approved agent context", resource: "sylla", risk: "observe" },
        { sequence: 2, title: "Open or resume the private workspace", resource: "desktop", risk: "prepare" },
        { sequence: 3, title: "Checkpoint the durable workspace", resource: "desktop", risk: "prepare" },
      ],
    };
  }
  if (capability === "operate_web_account") {
    return {
      resourcePlan: {
        primary: "browser",
        supporting: ["desktop"],
        reason: "The task requires web interaction and may require a visible authenticated takeover.",
      },
      plan: [
        { sequence: 1, title: "Inspect the permitted website", resource: "browser", risk: "observe" },
        { sequence: 2, title: "Prepare the requested external action", resource: "browser", risk: "prepare" },
        { sequence: 3, title: "Request confirmation at the point of action", resource: "sylla", risk },
        { sequence: 4, title: "Perform only the approved action", resource: "browser", risk },
      ],
    };
  }

  return {
    resourcePlan: {
      primary: "browser",
      supporting: capability === "prepare_meeting" ? ["desktop"] : [],
      reason: "The objective can be answered from participant-approved public evidence.",
    },
    plan: [
      { sequence: 1, title: "Validate the approved source scope", resource: "sylla", risk: "observe" },
      { sequence: 2, title: "Collect evidence from each source", resource: "browser", risk: "observe" },
      { sequence: 3, title: "Return bounded evidence to the connected host", resource: "sylla", risk: "observe" },
      { sequence: 4, title: "Offer memory proposals for review", resource: "sylla", risk: "prepare" },
    ],
  };
}

function needsSources(capability: MissionCapability) {
  return ![
    "find_private_introduction",
    "maintain_personal_workspace",
  ].includes(capability);
}

function nextAction(status: MissionStatus, capability: MissionCapability) {
  if (status === "waiting_for_input") {
    return capability === "test_software"
      ? "Ask the participant for one public repository URL, then start a new mission with it."
      : "Ask the participant for one to three explicit public URLs, then start a new mission with them.";
  }
  if (status === "waiting_for_approval") {
    return "Explain the proposed consequential action and call sylla_approve_mission only after the participant explicitly approves it.";
  }
  if (status === "ready") return "Call sylla_continue_mission.";
  if (status === "active") return "Mission execution is in progress.";
  if (status === "waiting_for_user") return "Report the result and wait for the participant's next decision.";
  if (status === "completed") return "Report the result naturally and offer to remember only what the participant requests.";
  if (status === "canceled") return "The mission is canceled. Do not continue it.";
  return "Explain the failure without hiding it; start a new bounded mission only if the participant asks.";
}

async function loadMissionForAgent(
  participantId: string,
  missionId: string,
): Promise<MissionView> {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const [mission] = await database
    .select()
    .from(agentMissions)
    .where(
      and(eq(agentMissions.id, missionId), eq(agentMissions.agentId, identity.agentId)),
    )
    .limit(1);
  if (!mission) throw new Error("That Sylla mission was not found.");
  const steps = await database
    .select()
    .from(missionSteps)
    .where(eq(missionSteps.missionId, mission.id))
    .orderBy(asc(missionSteps.sequence));
  return {
    id: mission.id,
    objective: mission.objective,
    requestedOutcome: mission.requestedOutcome,
    capability: mission.capability as MissionCapability,
    status: mission.status as MissionStatus,
    riskLevel: mission.riskLevel as MissionRisk,
    approvalRequired: mission.approvalRequired,
    approvedAt: mission.approvedAt?.toISOString() ?? null,
    constraints: mission.constraints,
    resourcePlan: mission.resourcePlan,
    plan: mission.plan as MissionPlanStep[],
    steps: steps.map((step) => ({
      id: step.id,
      sequence: step.sequence,
      title: step.title,
      resource: step.resource as MissionResource,
      risk: step.riskLevel as MissionRisk,
      status: step.status,
      output: step.output,
      providerExecutionRecorded: Boolean(step.providerReference),
      error: step.error,
    })),
    result: mission.result,
    lastError: mission.lastError,
    nextAction: nextAction(mission.status as MissionStatus, mission.capability as MissionCapability),
    createdAt: mission.createdAt.toISOString(),
    updatedAt: mission.updatedAt.toISOString(),
    completedAt: mission.completedAt?.toISOString() ?? null,
  };
}

export async function startMission(input: {
  participantId: string;
  clientId: string;
  mission: StartMissionInput;
}) {
  const parsed = startMissionSchema.parse(input.mission);
  const identity = await ensurePortableIdentity(input.participantId);
  const commandText = [parsed.objective, parsed.requestedOutcome]
    .filter(Boolean)
    .join(" ");
  const capability = classifyMission(commandText);
  const risk = classifyMissionRisk(commandText);
  const normalizedSources = parsed.sources.map((source) => ({
    url: assertPublicHttpUrl(source.url).toString(),
    ...(source.label ? { label: source.label } : {}),
  }));
  if (capability === "test_software" && normalizedSources.length > 1) {
    throw new Error("A software test mission accepts exactly one public repository URL.");
  }
  const constraints = {
    sourceUrls: normalizedSources,
    maxCredits: parsed.maxCredits,
    backgroundContinuationAllowed: parsed.backgroundContinuationAllowed,
  };
  const approvalRequired = ["external_action", "sensitive", "destructive"].includes(risk);
  const status: MissionStatus =
    needsSources(capability) && normalizedSources.length === 0
      ? "waiting_for_input"
      : approvalRequired
        ? "waiting_for_approval"
        : "ready";
  const { resourcePlan, plan } = buildMissionPlan(capability, risk);
  const database = getDatabase();
  const [created] = await database
    .insert(agentMissions)
    .values({
      userId: identity.userId,
      agentId: identity.agentId,
      participantId: input.participantId,
      clientId: input.clientId,
      idempotencyKey: parsed.requestId,
      objective: parsed.objective,
      requestedOutcome: parsed.requestedOutcome,
      capability,
      status,
      riskLevel: risk,
      approvalRequired,
      constraints,
      resourcePlan,
      plan,
    })
    .onConflictDoNothing({
      target: [agentMissions.participantId, agentMissions.idempotencyKey],
    })
    .returning({ id: agentMissions.id });

  let missionId = created?.id;
  if (!missionId) {
    const [existing] = await database
      .select()
      .from(agentMissions)
      .where(
        and(
          eq(agentMissions.participantId, input.participantId),
          eq(agentMissions.idempotencyKey, parsed.requestId),
        ),
      )
      .limit(1);
    if (
      !existing ||
      existing.objective !== parsed.objective ||
      existing.requestedOutcome !== (parsed.requestedOutcome ?? null) ||
      existing.clientId !== input.clientId ||
      JSON.stringify(existing.constraints) !== JSON.stringify(constraints)
    ) {
      throw new Error("That mission request ID already belongs to different work.");
    }
    missionId = existing.id;
  } else {
    await database.insert(missionSteps).values(
      plan.map((step) => ({
        missionId,
        sequence: step.sequence,
        title: step.title,
        resource: step.resource,
        riskLevel: step.risk,
      })),
    );
    await recordAuditEvent({
      participantId: input.participantId,
      actorType: "participant",
      action: "mission_created",
      entityType: "agent_mission",
      entityId: missionId,
      metadata: { capability, risk, approvalRequired },
    });
  }
  return loadMissionForAgent(input.participantId, missionId);
}

export function getMission(participantId: string, missionId: string) {
  return loadMissionForAgent(participantId, missionId);
}

export async function approveMission(input: {
  participantId: string;
  missionId: string;
  confirmation: "I APPROVE THIS MISSION";
}) {
  const identity = await ensurePortableIdentity(input.participantId);
  const [approved] = await getDatabase()
    .update(agentMissions)
    .set({ status: "ready", approvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(agentMissions.id, input.missionId),
        eq(agentMissions.agentId, identity.agentId),
        eq(agentMissions.status, "waiting_for_approval"),
        eq(agentMissions.approvalRequired, true),
      ),
    )
    .returning({ id: agentMissions.id });
  if (!approved) throw new Error("This mission is not waiting for approval.");
  await recordAuditEvent({
    participantId: input.participantId,
    actorType: "participant",
    action: "mission_approved",
    entityType: "agent_mission",
    entityId: input.missionId,
  });
  return loadMissionForAgent(input.participantId, input.missionId);
}

export async function claimMission(participantId: string, missionId: string) {
  const identity = await ensurePortableIdentity(participantId);
  const [claimed] = await getDatabase()
    .update(agentMissions)
    .set({ status: "active", lastError: null, updatedAt: new Date() })
    .where(
      and(
        eq(agentMissions.id, missionId),
        eq(agentMissions.agentId, identity.agentId),
        eq(agentMissions.status, "ready"),
      ),
    )
    .returning({ id: agentMissions.id });
  if (!claimed) return loadMissionForAgent(participantId, missionId);
  return loadMissionForAgent(participantId, claimed.id);
}

export async function markMissionStep(input: {
  participantId: string;
  missionId: string;
  sequence: number;
  status: "active" | "completed" | "failed" | "skipped";
  output?: Record<string, unknown>;
  providerReference?: string;
  error?: string;
}) {
  const mission = await loadMissionForAgent(input.participantId, input.missionId);
  if (!["active", "waiting_for_user"].includes(mission.status)) {
    throw new Error("This mission is not executing.");
  }
  await getDatabase()
    .update(missionSteps)
    .set({
      status: input.status,
      ...(input.output ? { output: input.output } : {}),
      ...(input.providerReference ? { providerReference: input.providerReference } : {}),
      ...(input.error ? { error: input.error } : {}),
      ...(input.status === "active" ? { startedAt: new Date() } : {}),
      ...(["completed", "failed", "skipped"].includes(input.status)
        ? { completedAt: new Date() }
        : {}),
    })
    .where(
      and(
        eq(missionSteps.missionId, input.missionId),
        eq(missionSteps.sequence, input.sequence),
      ),
    );
}

export async function completeMission(input: {
  participantId: string;
  missionId: string;
  result: Record<string, unknown>;
  waitingForUser?: boolean;
}) {
  const identity = await ensurePortableIdentity(input.participantId);
  const status = input.waitingForUser ? "waiting_for_user" : "completed";
  const [updated] = await getDatabase()
    .update(agentMissions)
    .set({
      status,
      result: input.result,
      updatedAt: new Date(),
      ...(status === "completed" ? { completedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(agentMissions.id, input.missionId),
        eq(agentMissions.agentId, identity.agentId),
        eq(agentMissions.status, "active"),
      ),
    )
    .returning({ id: agentMissions.id });
  if (!updated) throw new Error("This mission could not be completed from its current state.");
  await recordAuditEvent({
    participantId: input.participantId,
    actorType: "system",
    action: status === "completed" ? "mission_completed" : "mission_waiting_for_user",
    entityType: "agent_mission",
    entityId: input.missionId,
  });
  return loadMissionForAgent(input.participantId, input.missionId);
}

export async function failMission(input: {
  participantId: string;
  missionId: string;
  error: string;
}) {
  const identity = await ensurePortableIdentity(input.participantId);
  await getDatabase()
    .update(agentMissions)
    .set({ status: "failed", lastError: input.error.slice(0, 500), updatedAt: new Date() })
    .where(
      and(
        eq(agentMissions.id, input.missionId),
        eq(agentMissions.agentId, identity.agentId),
        inArray(agentMissions.status, ["ready", "active"]),
      ),
    );
  return loadMissionForAgent(input.participantId, input.missionId);
}

export async function cancelMission(input: {
  participantId: string;
  missionId: string;
  confirmation: "CANCEL THIS MISSION";
}) {
  const identity = await ensurePortableIdentity(input.participantId);
  const now = new Date();
  const database = getDatabase();
  const [canceled] = await database
    .update(agentMissions)
    .set({ status: "canceled", canceledAt: now, updatedAt: now })
    .where(
      and(
        eq(agentMissions.id, input.missionId),
        eq(agentMissions.agentId, identity.agentId),
        inArray(agentMissions.status, [
          "waiting_for_input",
          "waiting_for_approval",
          "ready",
          "active",
          "waiting_for_user",
        ]),
      ),
    )
    .returning({ id: agentMissions.id });
  if (!canceled) throw new Error("This mission is already closed or unavailable.");
  await database
    .update(runtimeLeases)
    .set({ releasedAt: now })
    .where(
      and(
        eq(runtimeLeases.agentId, identity.agentId),
        eq(runtimeLeases.ownerRunId, `mission-${input.missionId}`),
        isNull(runtimeLeases.releasedAt),
      ),
    );
  await recordAuditEvent({
    participantId: input.participantId,
    actorType: "participant",
    action: "mission_canceled",
    entityType: "agent_mission",
    entityId: input.missionId,
  });
  return loadMissionForAgent(input.participantId, input.missionId);
}
