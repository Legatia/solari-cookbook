import { z } from "zod";

export const sourceInputSchema = z.object({
  url: z.url(),
  label: z.string().trim().max(120).optional(),
});

export const researchInputSchema = z.object({
  agentName: z.string().trim().min(1).max(40),
  focus: z.string().trim().min(3).max(280),
  sources: z.array(sourceInputSchema).min(1).max(3),
});

export const observationUpdateSchema = z
  .object({
    claim: z.string().trim().min(3).max(600).optional(),
    status: z.enum(["pending", "confirmed", "edited"]).optional(),
    visibility: z.enum(["private", "shareable"]).optional(),
  })
  .refine(
    (value) =>
      value.claim !== undefined ||
      value.status !== undefined ||
      value.visibility !== undefined,
    "At least one observation field must change.",
  );

export type SyllaSource = {
  id: string;
  url: string;
  label: string | null;
  title: string | null;
  excerpt: string | null;
  status: string;
};

export type SyllaObservation = {
  id: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  claim: string;
  evidenceExcerpt: string | null;
  origin: "observed" | "inferred" | "told_to_me";
  status: "pending" | "confirmed" | "edited";
  visibility: "private" | "shareable";
  confidence: string | null;
};

export type SyllaWorkspace = {
  id: string;
  provider: string | null;
  sessionId: string | null;
  volumeId: string | null;
  snapshotId: string | null;
  status: "unprovisioned" | "starting" | "ready" | "paused" | "destroyed" | "failed";
  lastActiveAt: string | null;
  pausedAt: string | null;
};

export type SyllaSessionState = {
  participantId: string;
  identity: {
    userId: string;
    agentId: string;
    portable: true;
  };
  agentName: string | null;
  focus: string | null;
  stage: "consent" | "new" | "review" | "ready" | "withdrawn";
  event: {
    id: string;
    name: string;
    city: string | null;
    venue: string | null;
    startsAt: string | null;
  };
  participation: {
    displayName: string | null;
    policyVersion: string | null;
    consentedAt: string | null;
    backgroundContinuationAllowed: boolean;
    availability: Array<{
      id: string;
      startsAt: string;
      endsAt: string;
      timezone: string;
    }>;
    withdrawnAt: string | null;
  };
  research: {
    provider: string | null;
    runReference: string | null;
    completedAt: string | null;
  };
  sources: SyllaSource[];
  observations: SyllaObservation[];
  workspace: SyllaWorkspace | null;
};
