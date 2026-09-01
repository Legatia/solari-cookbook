import type { Evidence } from "@/lib/solari/contracts";

const MAX_SIGNAL_LENGTH = 220;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(value: string, maxLength = MAX_SIGNAL_LENGTH) {
  const normalized = clean(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function usefulSentence(excerpt: string) {
  const candidates = clean(excerpt)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => clean(sentence))
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 360)
    .filter(
      (sentence) =>
        !/^(skip to|menu|home|sign in|log in|cookie|privacy|search)/i.test(
          sentence,
        ),
    );

  return shorten(candidates[0] ?? excerpt);
}

export type ObservationDraft = {
  sourceId: string | null;
  claim: string;
  evidenceExcerpt: string | null;
  origin: "observed" | "inferred" | "told_to_me";
  status: "pending";
  visibility: "private";
  confidence: "high" | "medium";
};

export function synthesizeObservationDrafts(
  focus: string,
  evidence: Evidence[],
): ObservationDraft[] {
  const sourceTitles = evidence.map((item) => item.sourceTitle).filter(Boolean);
  const drafts: ObservationDraft[] = [
    {
      sourceId: null,
      claim: `Right now, you want me to understand: ${shorten(focus, 240)}`,
      evidenceExcerpt: shorten(focus, 280),
      origin: "told_to_me",
      status: "pending",
      visibility: "private",
      confidence: "high",
    },
    ...evidence.map((item) => {
      const signal = usefulSentence(item.excerpt);

      return {
        sourceId: item.sourceId,
        claim: signal
          ? `Your approved source “${shorten(item.sourceTitle, 90)}” emphasizes: ${signal}`
          : `You chose “${shorten(item.sourceTitle, 90)}” as evidence of what matters to you.`,
        evidenceExcerpt: signal || null,
        origin: "observed" as const,
        status: "pending" as const,
        visibility: "private" as const,
        confidence: "high" as const,
      };
    }),
  ];

  if (evidence.length > 1) {
    drafts.push({
      sourceId: null,
      claim:
        "You may prefer being understood through concrete work and recurring interests rather than a generic personality profile.",
      evidenceExcerpt: `You deliberately approved ${evidence.length} sources: ${shorten(sourceTitles.join(", "), 260)}.`,
      origin: "inferred",
      status: "pending",
      visibility: "private",
      confidence: "medium",
    });
  }

  return drafts;
}

