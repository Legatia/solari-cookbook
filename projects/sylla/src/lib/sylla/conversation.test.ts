import { describe, expect, it } from "vitest";

import {
  assessConversationNaturalness,
  conversationProfileInputSchema,
  rankApprovedMemories,
} from "./conversation";

describe("Sylla conversation layer", () => {
  it("ranks approved memory by current relevance before recency", () => {
    const ranked = rankApprovedMemories("Should I attend the pottery class?", [
      {
        id: "recent-unrelated",
        text: "Prefers quiet software meetups.",
        kind: "approved_observation",
        origin: "observed",
        source: "github.com",
        spokenAs: null,
        timestamp: 3,
      },
      {
        id: "older-relevant",
        text: "Has been curious about learning pottery in a small class.",
        kind: "approved_observation",
        origin: "inferred",
        source: "example.com",
        spokenAs: "Say this as your own guess.",
        timestamp: 1,
      },
      {
        id: "relationship-memory",
        text: "Felt most comfortable when a host introduced the group slowly.",
        kind: "approved_relationship_memory",
        origin: "distilled",
        source: null,
        spokenAs: null,
        timestamp: 2,
      },
    ]);

    expect(ranked[0]?.id).toBe("older-relevant");
    expect(ranked).toHaveLength(3);
    expect(ranked[0]).not.toHaveProperty("timestamp");
    // Provenance has to survive ranking, or the agent cannot speak an
    // inference as a guess or point at where a claim came from.
    expect(ranked[0]?.origin).toBe("inferred");
    expect(ranked[0]?.spokenAs).toBeTruthy();
    expect(ranked[0]?.source).toBe("example.com");
  });

  it("accepts explicit voice preferences but rejects an empty inferred update", () => {
    expect(
      conversationProfileInputSchema.safeParse({
        responseLength: "short",
        directness: 5,
        humor: "dry",
        avoidedBehaviors: ["Repeat my question before answering"],
      }).success,
    ).toBe(true);
    expect(conversationProfileInputSchema.safeParse({}).success).toBe(false);
  });

  it("flags stereotypical AI phrasing and internal state leakage", () => {
    const robotic = assessConversationNaturalness(
      "Certainly! I’d be happy to help. The task is waiting_for_input. Would you like option A? Would you like option B?",
    );
    expect(robotic.natural).toBe(false);
    expect(robotic.issues).toEqual(
      expect.arrayContaining([
        "canned_ai_phrase",
        "too_many_questions",
        "internal_state_leak",
      ]),
    );
  });

  it("accepts a direct, restrained companion response", () => {
    const natural = assessConversationNaturalness(
      "I’d skip this one. The format looks optimized for collecting contacts, and you’ve said those rooms usually drain you more than they help.",
    );
    expect(natural).toEqual({ natural: true, issues: [], wordCount: 23 });
  });
});
