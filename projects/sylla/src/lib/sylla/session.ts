import { createHash, randomBytes } from "node:crypto";

import { and, asc, desc, eq, ne } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db";
import {
  agentWorkspaces,
  approvedSources,
  availabilityWindows,
  events,
  observations,
  participantConsents,
  participants,
  workspaceArtifacts,
} from "@/db/schema";
import { createSolariAdapters } from "@/lib/solari";
import type { SyllaSessionState } from "@/lib/sylla/contracts";
import { ensurePortableIdentity } from "@/lib/sylla/identity";

const SESSION_COOKIE = "sylla_session";
const DEMO_EVENT_SLUG = "sylla-first-session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function validToken(value: string | undefined) {
  return value && /^[A-Za-z0-9_-]{32,}$/.test(value) ? value : undefined;
}

async function getOrCreateDemoEvent() {
  const database = getDatabase();
  const [created] = await database
    .insert(events)
    .values({
      slug: DEMO_EVENT_SLUG,
      name: "Sylla first session",
      status: "open",
    })
    .onConflictDoNothing({ target: events.slug })
    .returning();

  if (created) return created;

  const [existing] = await database
    .select()
    .from(events)
    .where(eq(events.slug, DEMO_EVENT_SLUG))
    .limit(1);

  if (!existing) {
    throw new Error("Unable to initialize the Sylla first-session event.");
  }

  return existing;
}

function demoSessionsEnabled() {
  if (process.env.SYLLA_ENABLE_DEMO_SESSIONS === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export async function resolveParticipant(request: NextRequest) {
  const database = getDatabase();
  const existingToken = validToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (existingToken) {
    const [participant] = await database
      .select()
      .from(participants)
      .where(eq(participants.inviteTokenHash, hashToken(existingToken)))
      .limit(1);

    if (participant) {
      await ensurePortableIdentity(participant.id);
      return { participant, newToken: null };
    }
  }

  if (!demoSessionsEnabled()) {
    throw new Error("Open Sylla from a valid event invitation.");
  }
  const event = await getOrCreateDemoEvent();
  const newToken = randomBytes(32).toString("base64url");
  const [participant] = await database
    .insert(participants)
    .values({
      eventId: event.id,
      inviteTokenHash: hashToken(newToken),
      ageConfirmed: false,
      status: "invited",
    })
    .returning();

  await ensurePortableIdentity(participant.id);

  return { participant, newToken };
}

export function attachSessionCookie<T extends NextResponse>(
  response: T,
  newToken: string | null,
) {
  if (newToken) {
    response.cookies.set(SESSION_COOKIE, newToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
  }
  return response;
}

export function jsonWithSession(
  body: unknown,
  newToken: string | null,
  init?: ResponseInit,
) {
  return attachSessionCookie(NextResponse.json(body, init), newToken);
}

export async function loadSessionState(
  participantId: string,
): Promise<SyllaSessionState> {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const [participant] = await database
    .select()
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);

  if (!participant) {
    throw new Error("Sylla session no longer exists.");
  }

  const [event] = await database
    .select()
    .from(events)
    .where(eq(events.id, participant.eventId))
    .limit(1);
  if (!event) throw new Error("The Sylla event no longer exists.");

  const [sourceRows, observationRows, workspaceRows, consentRows, availability] = await Promise.all([
    database
      .select()
      .from(approvedSources)
      .where(eq(approvedSources.participantId, participantId))
      .orderBy(asc(approvedSources.approvedAt)),
    database
      .select({
        observation: observations,
        sourceTitle: approvedSources.extractedTitle,
        sourceLabel: approvedSources.label,
        sourceUrl: approvedSources.url,
      })
      .from(observations)
      .leftJoin(approvedSources, eq(observations.sourceId, approvedSources.id))
      .where(
        and(
          eq(observations.participantId, participantId),
          ne(observations.status, "forgotten"),
        ),
      )
      .orderBy(asc(observations.observedAt)),
    database
      .select()
      .from(agentWorkspaces)
      .where(eq(agentWorkspaces.participantId, participantId))
      .limit(1),
    database
      .select()
      .from(participantConsents)
      .where(
        and(
          eq(participantConsents.participantId, participantId),
          eq(participantConsents.ageConfirmed, true),
        ),
      )
      .orderBy(desc(participantConsents.acceptedAt))
      .limit(1),
    database
      .select()
      .from(availabilityWindows)
      .where(eq(availabilityWindows.participantId, participantId))
      .orderBy(asc(availabilityWindows.startsAt)),
  ]);

  const hasResearch = observationRows.length > 0;
  const hasPending = observationRows.some(
    ({ observation }) => observation.status === "pending",
  );
  const consent = consentRows[0];
  const hasActiveConsent = Boolean(consent && !consent.withdrawnAt);

  return {
    participantId,
    identity: {
      userId: identity.userId,
      agentId: identity.agentId,
      portable: true,
    },
    agentName: identity.agentName,
    focus: identity.focus,
    stage:
      participant.status === "withdrawn"
        ? "withdrawn"
        : !hasActiveConsent
          ? "consent"
          : !hasResearch
            ? "new"
            : hasPending
              ? "review"
              : "ready",
    event: {
      id: event.id,
      name: event.name,
      city: event.city,
      venue: event.venue,
      startsAt: event.startsAt?.toISOString() ?? null,
    },
    participation: {
      displayName: participant.displayName,
      policyVersion: consent?.policyVersion ?? null,
      consentedAt: consent?.acceptedAt.toISOString() ?? null,
      backgroundContinuationAllowed:
        consent?.backgroundContinuation ?? false,
      availability: availability.map((window) => ({
        id: window.id,
        startsAt: window.startsAt.toISOString(),
        endsAt: window.endsAt.toISOString(),
        timezone: window.timezone,
      })),
      withdrawnAt: participant.withdrawnAt?.toISOString() ?? null,
    },
    research: {
      provider: participant.researchProvider,
      runReference: participant.researchRunReference,
      completedAt: participant.researchCompletedAt?.toISOString() ?? null,
    },
    sources: sourceRows.map((source) => ({
      id: source.id,
      url: source.url,
      label: source.label,
      title: source.extractedTitle,
      excerpt: source.evidenceExcerpt,
      status: source.researchStatus,
    })),
    observations: observationRows.map(
      ({ observation, sourceTitle, sourceLabel, sourceUrl }) => ({
        id: observation.id,
        sourceId: observation.sourceId,
        sourceTitle: sourceTitle ?? sourceLabel,
        sourceUrl,
        claim: observation.claim,
        evidenceExcerpt: observation.evidenceExcerpt,
        origin: observation.origin,
        status: observation.status as "pending" | "confirmed" | "edited",
        visibility: observation.visibility,
        confidence: observation.confidence,
      }),
    ),
    workspace: workspaceRows[0]
      ? {
          id: workspaceRows[0].id,
          provider: workspaceRows[0].provider,
          sessionId: workspaceRows[0].solariDesktopSessionId,
          volumeId: workspaceRows[0].solariVolumeId,
          snapshotId: workspaceRows[0].solariSnapshotId,
          status: workspaceRows[0].status,
          lastActiveAt: workspaceRows[0].lastActiveAt?.toISOString() ?? null,
          pausedAt: workspaceRows[0].pausedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function retireParticipantWorkspace(participantId: string) {
  const database = getDatabase();
  const [workspace] = await database
    .select()
    .from(agentWorkspaces)
    .where(eq(agentWorkspaces.participantId, participantId))
    .limit(1);

  if (!workspace) return;

  if (workspace.solariDesktopSessionId || workspace.solariVolumeId) {
    const adapters = await createSolariAdapters();
    let cleanupError: unknown;
    if (workspace.solariDesktopSessionId) {
      await adapters.desktop
        .destroy(workspace.solariDesktopSessionId)
        .catch((error) => {
          cleanupError = error;
        });
    }
    if (workspace.solariVolumeId) {
      await adapters.desktop
        .deleteVolume(workspace.solariVolumeId)
        .catch((error) => {
          cleanupError ??= error;
        });
    }
    if (cleanupError) throw cleanupError;
  }

  await database
    .delete(workspaceArtifacts)
    .where(eq(workspaceArtifacts.workspaceId, workspace.id));
  await database
    .update(agentWorkspaces)
    .set({
      provider: null,
      solariDesktopSessionId: null,
      solariVolumeId: null,
      solariSnapshotId: null,
      status: "destroyed",
      lastActiveAt: new Date(),
      destroyedAt: new Date(),
    })
    .where(eq(agentWorkspaces.id, workspace.id));
}
