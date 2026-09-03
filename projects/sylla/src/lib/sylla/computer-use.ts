import { eq, sql } from "drizzle-orm";
import * as z from "zod/v4";

import { getDatabase } from "@/db";
import { agentBrowserProfiles } from "@/db/schema";
import {
  browserComputerActionSchema,
  type BrowserComputerAdapter,
  type BrowserComputerResult,
} from "@/lib/solari/contracts";
import { createSolariAdapters } from "@/lib/solari";
import {
  OPERATION_CREDITS,
  releaseBillableOperation,
  reserveBillableOperation,
  settleBillableOperation,
} from "@/lib/sylla/billing";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import {
  acquireRuntimeLease,
  releaseRuntimeLease,
  requireRuntimeLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import {
  completeMission,
  getMission,
  markMissionStep,
  updateInteractiveMission,
  type MissionView,
} from "@/lib/sylla/missions";

export const interactiveBrowserInputSchema = z.object({
  missionId: z.uuid(),
  requestId: z.string().trim().min(8).max(160),
  actions: z.array(browserComputerActionSchema).min(1).max(12),
  done: z.boolean().default(false),
  summary: z.string().trim().min(3).max(800).optional(),
});

export type InteractiveBrowserInput = z.infer<
  typeof interactiveBrowserInputSchema
>;

function missionOrigins(mission: MissionView) {
  return [...new Set(mission.constraints.sourceUrls.map(({ url }) => new URL(url).origin))];
}

function visibleObservation(result: BrowserComputerResult) {
  return {
    url: result.page.url,
    title: result.page.title,
    text: result.page.text,
    controls: result.page.controls,
    humanCheckpoint: result.humanCheckpoint,
    actionsCompleted: result.actionsCompleted,
    sessionPersisted: result.profileSaved,
  };
}

async function saveBrowserProfile(input: {
  participantId: string;
  provider: string;
  providerProfileId: string;
  currentUrl: string;
  allowedOrigins: string[];
  incrementActionBatch?: boolean;
}) {
  const identity = await ensurePortableIdentity(input.participantId);
  const now = new Date();
  await getDatabase()
    .insert(agentBrowserProfiles)
    .values({
      agentId: identity.agentId,
      participantId: input.participantId,
      provider: input.provider,
      providerProfileId: input.providerProfileId,
      currentUrl: input.currentUrl,
      allowedOrigins: input.allowedOrigins,
      actionCount: input.incrementActionBatch ? 1 : 0,
      lastActiveAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentBrowserProfiles.agentId,
      set: {
        participantId: input.participantId,
        provider: input.provider,
        providerProfileId: input.providerProfileId,
        currentUrl: input.currentUrl,
        allowedOrigins: input.allowedOrigins,
        status: "ready",
        ...(input.incrementActionBatch
          ? { actionCount: sql`${agentBrowserProfiles.actionCount} + 1` }
          : {}),
        lastActiveAt: now,
        updatedAt: now,
      },
    });
}

async function getBrowserProfile(participantId: string) {
  const identity = await ensurePortableIdentity(participantId);
  const [profile] = await getDatabase()
    .select()
    .from(agentBrowserProfiles)
    .where(eq(agentBrowserProfiles.agentId, identity.agentId))
    .limit(1);
  return profile ?? null;
}

function assertInteractiveMission(mission: MissionView) {
  if (mission.capability !== "operate_web_account") {
    throw new Error("This mission does not authorize interactive web actions.");
  }
  if (mission.approvalRequired && !mission.approvedAt) {
    throw new Error("The participant has not approved this external action.");
  }
  if (!mission.constraints.sourceUrls[0]) {
    throw new Error("An approved starting URL is required for this web task.");
  }
}

export async function prepareInteractiveBrowserMission(input: {
  participantId: string;
  mission: MissionView;
  authorization: RuntimeLeaseAuthorization;
  adapter?: BrowserComputerAdapter;
}) {
  assertInteractiveMission(input.mission);
  await requireRuntimeLease(input.participantId, input.authorization);
  if (input.mission.constraints.maxCredits < OPERATION_CREDITS.browser_action) {
    throw new Error("This mission does not permit enough work credits to open its website.");
  }
  const origins = missionOrigins(input.mission);
  const existingProfile = await getBrowserProfile(input.participantId);
  const reservation = await reserveBillableOperation({
    participantId: input.participantId,
    operation: "browser_action",
    idempotencyKey: `mission:${input.mission.id}:browser:observe`,
  });
  if (reservation.alreadyProcessed) {
    throw new Error("The initial browser observation has already been prepared.");
  }

  try {
    const adapter = input.adapter ?? (await createSolariAdapters()).browserComputer;
    const result = await adapter.operate({
      participantRef: input.participantId,
      profileId: existingProfile?.providerProfileId,
      startUrl: input.mission.constraints.sourceUrls[0]!.url,
      allowedOrigins: origins,
      actions: [],
    });
    await settleBillableOperation(reservation, result.runReference);
    await saveBrowserProfile({
      participantId: input.participantId,
      provider: result.provider,
      providerProfileId: result.profileId,
      currentUrl: result.page.url,
      allowedOrigins: origins,
    });
    await markMissionStep({
      participantId: input.participantId,
      missionId: input.mission.id,
      sequence: 1,
      status: "completed",
      output: { approvedOrigins: origins },
      providerReference: result.runReference,
    });
    await markMissionStep({
      participantId: input.participantId,
      missionId: input.mission.id,
      sequence: 2,
      status: "completed",
      output: { observation: visibleObservation(result) },
    });
    await markMissionStep({
      participantId: input.participantId,
      missionId: input.mission.id,
      sequence: 3,
      status: "completed",
      output: { participantApprovalRecorded: Boolean(input.mission.approvedAt) },
    });
    await markMissionStep({
      participantId: input.participantId,
      missionId: input.mission.id,
      sequence: 4,
      status: "active",
    });
    return completeMission({
      participantId: input.participantId,
      missionId: input.mission.id,
      waitingForUser: true,
      result: {
        capability: input.mission.capability,
        interactive: true,
        externalActionPerformed: false,
        actionBatches: 0,
        observation: visibleObservation(result),
        nextHostAction:
          "Choose referenced controls and call sylla_act_on_web. Do not ask the participant to configure the website.",
      },
    });
  } catch (error) {
    await releaseBillableOperation(reservation);
    throw error;
  }
}

export async function operateInteractiveBrowserMission(input: {
  participantId: string;
  clientId: string;
  operation: InteractiveBrowserInput;
  adapter?: BrowserComputerAdapter;
}) {
  const operation = interactiveBrowserInputSchema.parse(input.operation);
  const mission = await getMission(input.participantId, operation.missionId);
  assertInteractiveMission(mission);
  if (mission.status !== "waiting_for_user") {
    throw new Error("This web mission is not waiting for a browser action.");
  }
  const profile = await getBrowserProfile(input.participantId);
  if (!profile) throw new Error("The mission's persistent browser is unavailable.");
  const previousResult = mission.result ?? {};
  const actionBatches =
    typeof previousResult.actionBatches === "number"
      ? previousResult.actionBatches
      : 0;
  const projectedCost =
    (actionBatches + 2) * OPERATION_CREDITS.browser_action;
  if (projectedCost > mission.constraints.maxCredits) {
    throw new Error("This browser action would exceed the mission's approved work budget.");
  }
  const origins = missionOrigins(mission);
  const firstSource = mission.constraints.sourceUrls[0]!;
  const startUrl =
    profile.currentUrl && origins.includes(new URL(profile.currentUrl).origin)
      ? profile.currentUrl
      : firstSource.url;
  let lease: Awaited<ReturnType<typeof acquireRuntimeLease>> | null = null;
  let reservation: Awaited<ReturnType<typeof reserveBillableOperation>> | null = null;
  try {
    lease = await acquireRuntimeLease({
      participantId: input.participantId,
      clientId: input.clientId,
      runId: `web:${mission.id}:${operation.requestId}`,
      purpose: mission.objective,
      durationSeconds: 300,
    });
    reservation = await reserveBillableOperation({
      participantId: input.participantId,
      operation: "browser_action",
      idempotencyKey: `mission:${mission.id}:browser:${operation.requestId}`,
    });
    if (reservation.alreadyProcessed) {
      return getMission(input.participantId, mission.id);
    }
    const adapter = input.adapter ?? (await createSolariAdapters()).browserComputer;
    const result = await adapter.operate({
      participantRef: input.participantId,
      profileId: profile.providerProfileId,
      startUrl,
      allowedOrigins: origins,
      actions: operation.actions,
    });
    await settleBillableOperation(reservation, result.runReference);
    await saveBrowserProfile({
      participantId: input.participantId,
      provider: result.provider,
      providerProfileId: result.profileId,
      currentUrl: result.page.url,
      allowedOrigins: origins,
      incrementActionBatch: true,
    });
    const completed = operation.done && !result.humanCheckpoint?.required;
    await markMissionStep({
      participantId: input.participantId,
      missionId: mission.id,
      sequence: 4,
      status: completed ? "completed" : "active",
      output: {
        observation: visibleObservation(result),
        doneRequested: operation.done,
      },
      providerReference: result.runReference,
    });
    return updateInteractiveMission({
      participantId: input.participantId,
      missionId: mission.id,
      completed,
      result: {
        capability: mission.capability,
        interactive: true,
        externalActionPerformed: result.actionsCompleted > 0,
        actionBatches: actionBatches + 1,
        observation: visibleObservation(result),
        ...(operation.summary ? { summary: operation.summary } : {}),
        nextHostAction: result.humanCheckpoint?.required
          ? "Explain the authentication checkpoint plainly and wait for the participant. Never request a password or one-time code in chat."
          : completed
            ? "Report the completed outcome naturally."
            : "Continue with sylla_act_on_web using the new referenced controls.",
      },
    });
  } catch (error) {
    if (reservation) await releaseBillableOperation(reservation);
    throw error;
  } finally {
    if (lease) {
      await releaseRuntimeLease(input.participantId, lease).catch(() => undefined);
    }
  }
}
