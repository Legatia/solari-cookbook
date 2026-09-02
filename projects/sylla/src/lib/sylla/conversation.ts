import { and, asc, eq, inArray, sql } from "drizzle-orm";
import * as z from "zod/v4";

import { getDatabase } from "@/db";
import {
  agentConversationProfiles,
  observations,
  participants,
  personalAgents,
  personalMemories,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import { recordAuditEvent } from "@/lib/sylla/participation";

const behaviorSchema = z.string().trim().min(3).max(100);

export const conversationProfileInputSchema = z
  .object({
    responseLength: z
      .enum(["terse", "short", "conversational", "detailed"])
      .optional(),
    warmth: z.number().int().min(1).max(5).optional(),
    directness: z.number().int().min(1).max(5).optional(),
    humor: z.enum(["none", "dry", "light", "playful"]).optional(),
    challengeStyle: z
      .enum(["affirming", "gentle", "direct", "socratic"])
      .optional(),
    preferredAddress: z.string().trim().min(1).max(40).optional(),
    preferredBehaviors: z.array(behaviorSchema).max(8).optional(),
    avoidedBehaviors: z.array(behaviorSchema).max(8).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Choose at least one conversation preference to change.",
  });

export const conversationBriefInputSchema = z.object({
  currentTopic: z.string().trim().min(3).max(280).optional(),
});

export type ConversationProfileInput = z.infer<
  typeof conversationProfileInputSchema
>;

export type ConversationProfileView = {
  responseLength: "terse" | "short" | "conversational" | "detailed";
  warmth: number;
  directness: number;
  humor: "none" | "dry" | "light" | "playful";
  challengeStyle: "affirming" | "gentle" | "direct" | "socratic";
  preferredAddress: string | null;
  preferredBehaviors: string[];
  avoidedBehaviors: string[];
  version: number;
  updatedAt: string;
};

export type ConversationBrief = {
  agent: { name: string | null; preferredAddress: string | null };
  relationship: {
    stage: "new" | "familiar" | "established";
    approvedMemoryCount: number;
    relevantMemories: Array<{
      id: string;
      text: string;
      kind: "approved_observation" | "approved_relationship_memory";
    }>;
  };
  voice: ConversationProfileView;
  responseContract: {
    openingMove: string;
    tone: string;
    shape: string;
    memoryUse: string;
    questions: string;
    honesty: string;
    avoid: string[];
  };
  privacy: {
    fullTranscriptStoredBySylla: false;
    onlyApprovedMemoryIncluded: true;
    currentTopicPersistedBySylla: false;
  };
};

type RankedMemory = ConversationBrief["relationship"]["relevantMemories"][number] & {
  timestamp: number;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "but",
  "for",
  "from",
  "have",
  "into",
  "just",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "you",
  "your",
]);

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? [],
  );
}

export function rankApprovedMemories(
  currentTopic: string | undefined,
  memories: RankedMemory[],
  limit = 4,
) {
  const topicTokens = tokens(currentTopic ?? "");
  return memories
    .map((memory) => {
      const memoryTokens = tokens(memory.text);
      const overlap = [...memoryTokens].filter((token) => topicTokens.has(token)).length;
      const relationshipBonus =
        memory.kind === "approved_relationship_memory" ? 2 : 0;
      return { memory, score: overlap * 10 + relationshipBonus };
    })
    .sort(
      (left, right) =>
        right.score - left.score || right.memory.timestamp - left.memory.timestamp,
    )
    .slice(0, limit)
    .map(({ memory }) => ({
      id: memory.id,
      text: memory.text,
      kind: memory.kind,
    }));
}

function profileView(
  profile: typeof agentConversationProfiles.$inferSelect,
): ConversationProfileView {
  return {
    responseLength: profile.responseLength as ConversationProfileView["responseLength"],
    warmth: profile.warmth,
    directness: profile.directness,
    humor: profile.humor as ConversationProfileView["humor"],
    challengeStyle: profile.challengeStyle as ConversationProfileView["challengeStyle"],
    preferredAddress: profile.preferredAddress,
    preferredBehaviors: profile.preferredBehaviors,
    avoidedBehaviors: profile.avoidedBehaviors,
    version: profile.version,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

async function ensureConversationProfile(participantId: string) {
  const identity = await ensurePortableIdentity(participantId);
  const database = getDatabase();
  await database
    .insert(agentConversationProfiles)
    .values({ agentId: identity.agentId })
    .onConflictDoNothing({ target: agentConversationProfiles.agentId });
  const [profile] = await database
    .select()
    .from(agentConversationProfiles)
    .where(eq(agentConversationProfiles.agentId, identity.agentId))
    .limit(1);
  if (!profile) throw new Error("The agent's conversation profile is unavailable.");
  return { identity, profile };
}

export async function getConversationProfile(participantId: string) {
  const { profile } = await ensureConversationProfile(participantId);
  return profileView(profile);
}

export async function updateConversationProfile(
  participantId: string,
  rawInput: ConversationProfileInput,
) {
  const input = conversationProfileInputSchema.parse(rawInput);
  const { identity } = await ensureConversationProfile(participantId);
  const database = getDatabase();
  const [updated] = await database
    .update(agentConversationProfiles)
    .set({
      ...input,
      version: sql`${agentConversationProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agentConversationProfiles.agentId, identity.agentId))
    .returning();
  if (!updated) throw new Error("The conversation preferences were not saved.");
  await recordAuditEvent({
    participantId,
    actorType: "participant",
    action: "conversation_profile_updated",
    entityType: "personal_agent",
    entityId: identity.agentId,
    metadata: { changedFields: Object.keys(input).join(",") },
  });
  return profileView(updated);
}

function openingMove(currentTopic?: string) {
  const value = currentTopic?.toLowerCase() ?? "";
  if (/\b(feel|felt|lonely|afraid|anxious|upset|hurt|awkward|embarrassed)\b/.test(value)) {
    return "Acknowledge the specific feeling or tension once, without therapy-speak or exaggerated validation, then respond to the substance.";
  }
  if (/\b(choose|decide|should i|which|recommend|better)\b/.test(value)) {
    return "Lead with the recommendation and its most important tradeoff; explain only enough to make the choice useful.";
  }
  return "Respond to the actual point immediately. Do not announce that you understand, summarize the request, or describe your process first.";
}

function responseShape(length: ConversationProfileView["responseLength"]) {
  if (length === "terse") return "Usually one or two sentences.";
  if (length === "short") return "Usually two to four sentences, with no heading unless structure is essential.";
  if (length === "conversational") return "Use a few short paragraphs and let the participant pull for more depth.";
  return "Give useful depth, but begin with the conclusion and avoid repetitive summary sections.";
}

function toneGuidance(profile: ConversationProfileView) {
  const warmth =
    profile.warmth >= 4
      ? "Sound warm and personally attentive, but never gushy."
      : profile.warmth <= 2
        ? "Keep warmth understated and let usefulness carry the response."
        : "Be quietly warm without over-validating.";
  const directness =
    profile.directness >= 4
      ? "Say the real point plainly, including disagreement."
      : "Soften disagreement without hiding it.";
  const humor =
    profile.humor === "none"
      ? "Do not add jokes."
      : `Use ${profile.humor} humor only when it arises naturally.`;
  const challenge =
    profile.challengeStyle === "affirming"
      ? "Prioritize support before challenge."
      : profile.challengeStyle === "direct"
        ? "Challenge weak assumptions directly."
        : profile.challengeStyle === "socratic"
          ? "Challenge through one precise question rather than a lecture."
          : "Challenge gently and specifically.";
  return [warmth, directness, humor, challenge].join(" ");
}

export async function prepareConversationBrief(
  participantId: string,
  rawInput: z.infer<typeof conversationBriefInputSchema>,
): Promise<ConversationBrief> {
  const input = conversationBriefInputSchema.parse(rawInput);
  const { identity, profile } = await ensureConversationProfile(participantId);
  const database = getDatabase();
  const ownedParticipants = await database
    .select({
      id: participants.id,
      createdAt: participants.createdAt,
    })
    .from(participants)
    .where(eq(participants.agentId, identity.agentId))
    .orderBy(asc(participants.createdAt));
  const participantIds = ownedParticipants.map((participant) => participant.id);
  const [agent] = await database
    .select({ name: personalAgents.name })
    .from(personalAgents)
    .where(eq(personalAgents.id, identity.agentId))
    .limit(1);
  const approvedObservations = participantIds.length
    ? await database
        .select({
          id: observations.id,
          text: observations.claim,
          observedAt: observations.observedAt,
        })
        .from(observations)
        .where(
          and(
            inArray(observations.participantId, participantIds),
            inArray(observations.status, ["confirmed", "edited"]),
          ),
        )
    : [];
  const approvedRelationshipMemories = participantIds.length
    ? await database
        .select({
          id: personalMemories.id,
          text: personalMemories.summary,
          createdAt: personalMemories.createdAt,
        })
        .from(personalMemories)
        .where(
          and(
            inArray(personalMemories.participantId, participantIds),
            inArray(personalMemories.status, ["approved", "edited"]),
          ),
        )
    : [];
  const ranked: RankedMemory[] = [
    ...approvedObservations.map((memory) => ({
      id: memory.id,
      text: memory.text,
      kind: "approved_observation" as const,
      timestamp: memory.observedAt.getTime(),
    })),
    ...approvedRelationshipMemories.map((memory) => ({
      id: memory.id,
      text: memory.text,
      kind: "approved_relationship_memory" as const,
      timestamp: memory.createdAt.getTime(),
    })),
  ];
  const voice = profileView(profile);
  const memoryCount = ranked.length;

  return {
    agent: {
      name: agent?.name ?? identity.agentName,
      preferredAddress: voice.preferredAddress,
    },
    relationship: {
      stage:
        memoryCount >= 6 ? "established" : memoryCount >= 2 ? "familiar" : "new",
      approvedMemoryCount: memoryCount,
      relevantMemories: rankApprovedMemories(input.currentTopic, ranked),
    },
    voice,
    responseContract: {
      openingMove: openingMove(input.currentTopic),
      tone: toneGuidance(voice),
      shape: responseShape(voice.responseLength),
      memoryUse:
        "Use a relevant memory quietly when it improves the response. Never list memories, prove recall, or force a personal reference.",
      questions:
        "Ask at most one genuine question. Do not end every reply with an offer, menu, or 'Would you like me to…?'.",
      honesty:
        "Be warm without claiming human feelings, consciousness, exclusivity, dependence, or a relationship the participant did not define.",
      avoid: [
        "Certainly!",
        "I'd be happy to help",
        "I understand how you feel",
        "Here is a comprehensive overview",
        "As an AI",
        ...voice.avoidedBehaviors,
      ],
    },
    privacy: {
      fullTranscriptStoredBySylla: false,
      onlyApprovedMemoryIncluded: true,
      currentTopicPersistedBySylla: false,
    },
  };
}

export function assessConversationNaturalness(text: string) {
  const issues: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean);
  const canned = [
    /\bcertainly[!,]/i,
    /\bi(?:'d| would) be happy to help\b/i,
    /\bi understand how you feel\b/i,
    /\bhere(?:'s| is) a comprehensive overview\b/i,
    /\bas an ai\b/i,
  ];
  if (canned.some((pattern) => pattern.test(text))) issues.push("canned_ai_phrase");
  if ((text.match(/\?/g) ?? []).length > 1) issues.push("too_many_questions");
  if ((text.match(/^#{1,6}\s/gm) ?? []).length > 2) issues.push("over_structured");
  if (/\b(waiting_for_|host_orchestrated|providerReference|leaseToken)\w*/.test(text)) {
    issues.push("internal_state_leak");
  }
  if (words.length > 220) issues.push("default_reply_too_long");
  return { natural: issues.length === 0, issues, wordCount: words.length };
}
