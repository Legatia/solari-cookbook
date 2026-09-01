import { eq } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  agentWorkspaces,
  participants,
  personalAgents,
  syllaUsers,
} from "@/db/schema";

export type PortableIdentity = {
  userId: string;
  agentId: string;
  agentName: string | null;
  focus: string | null;
};

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
