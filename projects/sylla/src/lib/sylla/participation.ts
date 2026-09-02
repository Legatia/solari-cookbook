import { and, desc, eq, isNull } from "drizzle-orm";
import * as z from "zod/v4";

import { getDatabase } from "@/db";
import {
  auditEvents,
  agentMissions,
  availabilityWindows,
  hostConnections,
  participantConsents,
  participants,
  runtimeLeases,
} from "@/db/schema";
import { revokeParticipantOAuthTokens } from "@/lib/mcp/first-party-oauth";
import { updatePortableAgent } from "@/lib/sylla/identity";
import { loadSessionState, retireParticipantWorkspace } from "@/lib/sylla/session";

export const PARTICIPATION_POLICY_VERSION = "2026-09-01";

const availabilitySchema = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    timezone: z.string().trim().min(1).max(80),
  })
  .refine(
    (window) => new Date(window.endsAt) > new Date(window.startsAt),
    "Availability must end after it starts.",
  );

export const participationConsentSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  policyVersion: z.literal(PARTICIPATION_POLICY_VERSION),
  ageConfirmed: z.literal(true),
  publicSourceResearch: z.literal(true),
  privateMemoryStorage: z.literal(true),
  matchmaking: z.literal(true),
  hostDataBoundary: z.literal(true),
  backgroundContinuation: z.boolean().default(false),
  availability: z.array(availabilitySchema).min(1).max(5),
});

export type ParticipationConsentInput = z.infer<
  typeof participationConsentSchema
>;

export const conversationalSetupSchema = participationConsentSchema.extend({
  agentName: z.string().trim().min(1).max(40),
  focus: z.string().trim().min(3).max(280),
});

export type ConversationalSetupInput = z.infer<
  typeof conversationalSetupSchema
>;

export const PARTICIPATION_PERMISSION_COPY = {
  ageConfirmed: "I confirm that I am at least 18 years old.",
  publicSourceResearch:
    "Sylla may visit only the public URLs I explicitly submit.",
  privateMemoryStorage:
    "Sylla may store proposed private memories; none become approved until I decide.",
  matchmaking:
    "Sylla may use only my approved shareable context to look for introductions.",
  hostDataBoundary:
    "I understand my chosen LLM host may retain our conversation under its own terms.",
  backgroundContinuation:
    "Optional: Sylla may finish already-approved public-source research after my LLM disconnects. This never permits introductions or disclosures.",
} as const;

export async function requireParticipationCapability(
  participantId: string,
  capability:
    | "publicSourceResearch"
    | "privateMemoryStorage"
    | "matchmaking"
    | "backgroundContinuation",
) {
  const [consent] = await getDatabase()
    .select()
    .from(participantConsents)
    .where(
      and(
        eq(participantConsents.participantId, participantId),
        isNull(participantConsents.withdrawnAt),
      ),
    )
    .orderBy(desc(participantConsents.acceptedAt))
    .limit(1);
  if (!consent || !consent[capability]) {
    throw new Error(
      `Active participant consent is required for ${capability}.`,
    );
  }
  return consent;
}

export async function recordAuditEvent(input: {
  eventId?: string | null;
  participantId?: string | null;
  actorType: "participant" | "organizer" | "system";
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await getDatabase().insert(auditEvents).values({
    eventId: input.eventId,
    participantId: input.participantId,
    actorType: input.actorType,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
  });
}

export async function acceptParticipationConsent(
  participantId: string,
  rawInput: unknown,
) {
  const input = participationConsentSchema.parse(rawInput);
  const database = getDatabase();
  const [participant] = await database
    .select()
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!participant || participant.status === "withdrawn") {
    throw new Error("This event participation is unavailable.");
  }
  const [existing] = await database
    .select()
    .from(participantConsents)
    .where(
      and(
        eq(participantConsents.participantId, participantId),
        eq(participantConsents.policyVersion, input.policyVersion),
      ),
    )
    .limit(1);
  if (existing) {
    const sameConsent =
      existing.ageConfirmed === input.ageConfirmed &&
      existing.publicSourceResearch === input.publicSourceResearch &&
      existing.privateMemoryStorage === input.privateMemoryStorage &&
      existing.matchmaking === input.matchmaking &&
      existing.hostDataBoundary === input.hostDataBoundary &&
      existing.backgroundContinuation === input.backgroundContinuation &&
      !existing.withdrawnAt;
    if (!sameConsent) {
      throw new Error(
        "This policy version was already answered differently. Withdraw it before accepting a new version.",
      );
    }
  } else {
    await database.insert(participantConsents).values({
      participantId,
      policyVersion: input.policyVersion,
      ageConfirmed: input.ageConfirmed,
      publicSourceResearch: input.publicSourceResearch,
      privateMemoryStorage: input.privateMemoryStorage,
      matchmaking: input.matchmaking,
      hostDataBoundary: input.hostDataBoundary,
      backgroundContinuation: input.backgroundContinuation,
    });
  }

  await database
    .delete(availabilityWindows)
    .where(eq(availabilityWindows.participantId, participantId));
  await database.insert(availabilityWindows).values(
    input.availability.map((window) => ({
      participantId,
      startsAt: new Date(window.startsAt),
      endsAt: new Date(window.endsAt),
      timezone: window.timezone,
    })),
  );
  await database
    .update(participants)
    .set({
      displayName: input.displayName,
      ageConfirmed: true,
      status: "onboarding",
    })
    .where(eq(participants.id, participantId));
  await recordAuditEvent({
    eventId: participant.eventId,
    participantId,
    actorType: "participant",
    action: existing ? "participation_availability_updated" : "participation_consented",
    entityType: "participant_consent",
    entityId: existing?.id ?? null,
    metadata: {
      policyVersion: input.policyVersion,
      availabilityWindowCount: input.availability.length,
      backgroundContinuation: input.backgroundContinuation,
    },
  });
  return loadSessionState(participantId);
}

export async function completeConversationalSetup(
  participantId: string,
  rawInput: unknown,
) {
  const input = conversationalSetupSchema.parse(rawInput);
  await updatePortableAgent(participantId, {
    agentName: input.agentName,
    focus: input.focus,
  });
  return acceptParticipationConsent(participantId, {
    displayName: input.displayName,
    policyVersion: input.policyVersion,
    ageConfirmed: input.ageConfirmed,
    publicSourceResearch: input.publicSourceResearch,
    privateMemoryStorage: input.privateMemoryStorage,
    matchmaking: input.matchmaking,
    hostDataBoundary: input.hostDataBoundary,
    backgroundContinuation: input.backgroundContinuation,
    availability: input.availability,
  });
}

export async function withdrawParticipation(participantId: string) {
  const database = getDatabase();
  const [participant] = await database
    .select()
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!participant) throw new Error("This event participation no longer exists.");
  const now = new Date();
  await database
    .update(participants)
    .set({ status: "withdrawn", withdrawnAt: now })
    .where(eq(participants.id, participantId));
  await database
    .update(participantConsents)
    .set({ withdrawnAt: now })
    .where(
      and(
        eq(participantConsents.participantId, participantId),
        isNull(participantConsents.withdrawnAt),
      ),
    );
  await database
    .update(runtimeLeases)
    .set({ releasedAt: now })
    .where(
      and(
        eq(runtimeLeases.participantId, participantId),
        isNull(runtimeLeases.releasedAt),
      ),
    );
  await database
    .update(agentMissions)
    .set({ status: "canceled", canceledAt: now, updatedAt: now })
    .where(
      and(
        eq(agentMissions.participantId, participantId),
        isNull(agentMissions.completedAt),
        isNull(agentMissions.canceledAt),
      ),
    );
  if (participant.userId) {
    await database
      .update(hostConnections)
      .set({ revokedAt: now })
      .where(
        and(
          eq(hostConnections.userId, participant.userId),
          isNull(hostConnections.revokedAt),
        ),
      );
  }
  await revokeParticipantOAuthTokens(participantId);
  await recordAuditEvent({
    eventId: participant.eventId,
    participantId,
    actorType: "participant",
    action: "participation_withdrawn",
    entityType: "participant",
    entityId: participantId,
    metadata: { hostConnectionsRevoked: true, runtimeLeaseReleased: true },
  });
  await retireParticipantWorkspace(participantId).catch(async (error) => {
    await recordAuditEvent({
      eventId: participant.eventId,
      participantId,
      actorType: "system",
      action: "withdrawal_workspace_cleanup_failed",
      entityType: "participant",
      entityId: participantId,
      metadata: {
        error: error instanceof Error ? error.message.slice(0, 180) : "unknown",
      },
    });
  });
  return loadSessionState(participantId);
}
