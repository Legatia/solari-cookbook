import { describe, expect, it } from "vitest";

import { synthesizeObservationDrafts } from "./research";

describe("Sylla observation synthesis", () => {
  it("keeps told, observed, and inferred knowledge distinct", () => {
    const result = synthesizeObservationDrafts(
      "I want to build technology for lasting human relationships.",
      [
        {
          sourceId: "source-1",
          sourceUrl: "https://example.com/one",
          sourceTitle: "A public project",
          excerpt:
            "This project explores how shared rituals help neighbors become a durable community over time.",
          observedAt: new Date().toISOString(),
        },
        {
          sourceId: "source-2",
          sourceUrl: "https://example.com/two",
          sourceTitle: "A second public project",
          excerpt:
            "The work focuses on patient collaboration and meaningful follow-up after people first meet.",
          observedAt: new Date().toISOString(),
        },
      ],
    );

    expect(result.map((item) => item.origin)).toEqual([
      "told_to_me",
      "observed",
      "observed",
      "inferred",
    ]);
    expect(result.every((item) => item.status === "pending")).toBe(true);
    expect(result.every((item) => item.visibility === "private")).toBe(true);
    expect(result[1].sourceId).toBe("source-1");
  });

  it("does not invent an inference from a single source", () => {
    const result = synthesizeObservationDrafts("I am changing careers.", [
      {
        sourceId: "source-1",
        sourceUrl: "https://example.com",
        sourceTitle: "Profile",
        excerpt: "A short public profile.",
        observedAt: new Date().toISOString(),
      },
    ]);

    expect(result.map((item) => item.origin)).toEqual([
      "told_to_me",
      "observed",
    ]);
  });
});

