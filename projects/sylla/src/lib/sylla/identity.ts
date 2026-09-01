import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  agentWorkspaces,
  authIdentities,
  events,
  hostConnections,
  participants,
  personalAgents,
  syllaUsers,
} from "@/db/schema";

const DEFAULT_EVENT_SLUG = "sylla-first-session";
const ID_NAMESPACE = Buffer.from("9c9cbe939d7b5f3393f96eeae7a75b5c", "hex");

export type PortableIdentity = {
  userId: string;
  agentId: string;
  agentName: string | null;
  focus: string | null;
};

export type AuthenticatedPrincipalInput = {
  issuer: string;
  subject: string;
  clientId: string;
  scopes: string[];
  email?: string;
  displayName?: string;
};

export type AuthenticatedPrincipal = PortableIdentity & {
  participantId: string;
  authIdentityId: string;
};

function stableUuid(...parts: string[]) {
  const hash = createHash("sha1")
    .update(ID_NAMESPACE)
    .update(parts.join("\u001f"))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getOrCreateDefaultEvent() {
  const database = getDatabase();
  await database
    .insert(events)
    .values({
      slug: DEFAULT_EVENT_SLUG,
      name: "Sylla first session",
      status: "open",
    })
    .onConflictDoNothing({ target: events.slug });

  const [event] = await database
    .select()
    .from(events)
    .where(eq(events.slug, DEFAULT_EVENT_SLUG))
    .limit(1);

  if (!event) throw new Error("Unable to initialize the Sylla first session.");
  return event;
}

export async function ensurePortableIdentity(
  participantId: string,
): Promise<PortableIdentity> {
  const database = getDatabase();
  const [participant] = await database
    .select()
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);

  if (!participant) {
    throw new Error("Sylla participant no longer exists.");
  }

  const userId = participant.userId ?? participant.id;
  await database
    .insert(syllaUsers)
    .values({ id: userId, displayName: participant.displayName })
    .onConflictDoNothing({ target: syllaUsers.id });

  let [agent] = await database
    .select()
    .from(personalAgents)
    .where(eq(personalAgents.ownerUserId, userId))
    .limit(1);

  if (!agent) {
    const preferredAgentId = participant.agentId ?? participant.id;
    await database
      .insert(personalAgents)
      .values({
        id: preferredAgentId,
        ownerUserId: userId,
        name: participant.agentName,
        focus: participant.intent,
      })
      .onConflictDoNothing({ target: personalAgents.ownerUserId });

    [agent] = await database
      .select()
      .from(personalAgents)
      .where(eq(personalAgents.ownerUserId, userId))
      .limit(1);
  }

  if (!agent) {
    throw new Error("Unable to initialize the personal agent identity.");
  }

  if (
    (participant.agentName && participant.agentName !== agent.name) ||
    (participant.intent && participant.intent !== agent.focus)
  ) {
    [agent] = await database
      .update(personalAgents)
      .set({
        ...(participant.agentName ? { name: participant.agentName } : {}),
        ...(participant.intent ? { focus: participant.intent } : {}),
        updatedAt: new Date(),
      })
      .where(eq(personalAgents.id, agent.id))
      .returning();
  }

  await database
    .update(participants)
    .set({ userId, agentId: agent.id })
    .where(eq(participants.id, participantId));

  await database
    .insert(agentWorkspaces)
    .values({
      participantId,
      agentId: agent.id,
      status: "unprovisioned",
    })
    .onConflictDoNothing({ target: agentWorkspaces.participantId });

  const [workspace] = await database
    .select({ agentId: agentWorkspaces.agentId })
    .from(agentWorkspaces)
    .where(eq(agentWorkspaces.participantId, participantId))
    .limit(1);

  if (workspace && workspace.agentId !== agent.id) {
    await database
      .update(agentWorkspaces)
      .set({ agentId: agent.id })
      .where(eq(agentWorkspaces.participantId, participantId));
  }

  return {
    userId,
    agentId: agent.id,
    agentName: agent.name,
    focus: agent.focus,
  };
}

export async function updatePortableAgent(
  participantId: string,
  input: { agentName?: string; focus?: string },
): Promise<PortableIdentity> {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const agentName = input.agentName?.trim();
  const focus = input.focus?.trim();

  if (agentName || focus) {
    await Promise.all([
      database
        .update(personalAgents)
        .set({
          ...(agentName ? { name: agentName } : {}),
          ...(focus ? { focus } : {}),
          updatedAt: new Date(),
        })
        .where(eq(personalAgents.id, identity.agentId)),
      database
        .update(participants)
        .set({
          ...(agentName ? { agentName } : {}),
          ...(focus ? { intent: focus } : {}),
        })
        .where(eq(participants.id, participantId)),
    ]);
  }

  return ensurePortableIdentity(participantId);
}

export async function resolveAuthenticatedPrincipal(
  input: AuthenticatedPrincipalInput,
): Promise<AuthenticatedPrincipal> {
  const database = getDatabase();
  let [authIdentity] = await database
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.provider, input.issuer),
        eq(authIdentities.providerSubject, input.subject),
      ),
    )
    .limit(1);

  const userId =
    authIdentity?.userId ?? stableUuid("oauth-user", input.issuer, input.subject);

  await database
    .insert(syllaUsers)
    .values({ id: userId, displayName: input.displayName })
    .onConflictDoNothing({ target: syllaUsers.id });

  if (input.displayName) {
    await database
      .update(syllaUsers)
      .set({ displayName: input.displayName, updatedAt: new Date() })
      .where(eq(syllaUsers.id, userId));
  }

  if (!authIdentity) {
    const authIdentityId = stableUuid(
      "oauth-identity",
      input.issuer,
      input.subject,
    );
    await database
      .insert(authIdentities)
      .values({
        id: authIdentityId,
        userId,
        provider: input.issuer,
        providerSubject: input.subject,
        email: input.email,
      })
      .onConflictDoNothing({
        target: [authIdentities.provider, authIdentities.providerSubject],
      });

    [authIdentity] = await database
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, input.issuer),
          eq(authIdentities.providerSubject, input.subject),
        ),
      )
      .limit(1);
  }

  if (!authIdentity) {
    throw new Error("Unable to link the authenticated Sylla identity.");
  }

  await database
    .update(authIdentities)
    .set({
      ...(input.email ? { email: input.email } : {}),
      lastUsedAt: new Date(),
    })
    .where(eq(authIdentities.id, authIdentity.id));

  const agentId = stableUuid("personal-agent", userId);
  await database
    .insert(personalAgents)
    .values({ id: agentId, ownerUserId: userId })
    .onConflictDoNothing({ target: personalAgents.ownerUserId });

  const [agent] = await database
    .select()
    .from(personalAgents)
    .where(eq(personalAgents.ownerUserId, userId))
    .limit(1);

  if (!agent) throw new Error("Unable to recover the authenticated agent.");

  const event = await getOrCreateDefaultEvent();
  const participantId = stableUuid("participant", event.id, agent.id);
  const inviteTokenHash = createHash("sha256")
    .update(`oauth:${input.issuer}:${input.subject}:${event.id}`)
    .digest("hex");

  await database
    .insert(participants)
    .values({
      id: participantId,
      userId,
      agentId: agent.id,
      eventId: event.id,
      inviteTokenHash,
      displayName: input.displayName,
      agentName: agent.name,
      intent: agent.focus,
      status: "invited",
    })
    .onConflictDoNothing({
      target: [participants.eventId, participants.agentId],
    });

  const [participant] = await database
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.eventId, event.id),
        eq(participants.agentId, agent.id),
      ),
    )
    .limit(1);

  if (!participant) {
    throw new Error("Unable to initialize the authenticated participant.");
  }

  const [existingConnection] = await database
    .select()
    .from(hostConnections)
    .where(
      and(
        eq(hostConnections.authIdentityId, authIdentity.id),
        eq(hostConnections.clientId, input.clientId),
      ),
    )
    .limit(1);

  if (existingConnection?.revokedAt) {
    throw new Error("This Sylla host connection has been revoked.");
  }

  await database
    .insert(hostConnections)
    .values({
      userId,
      authIdentityId: authIdentity.id,
      clientId: input.clientId,
      scopes: input.scopes,
    })
    .onConflictDoUpdate({
      target: [hostConnections.authIdentityId, hostConnections.clientId],
      set: {
        scopes: input.scopes,
        lastSeenAt: new Date(),
      },
    });

  const identity = await ensurePortableIdentity(participant.id);
  return {
    ...identity,
    participantId: participant.id,
    authIdentityId: authIdentity.id,
  };
}
