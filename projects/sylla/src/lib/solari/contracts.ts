import { z } from "zod";

export const approvedSourceSchema = z.object({
  id: z.string().min(1),
  url: z.url(),
  label: z.string().max(120).optional(),
});

export const evidenceSchema = z.object({
  sourceId: z.string().min(1),
  sourceUrl: z.url(),
  sourceTitle: z.string(),
  excerpt: z.string(),
  observedAt: z.iso.datetime(),
});

export const researchRequestSchema = z.object({
  participantRef: z.string().min(1),
  sources: z.array(approvedSourceSchema).min(1).max(3),
});

export const researchResultSchema = z.object({
  provider: z.enum(["mock", "solari"]),
  runReference: z.string().min(1),
  evidence: z.array(evidenceSchema),
});

export const workspaceManifestSchema = z.object({
  participantRef: z.string().min(1),
  agentName: z.string().min(1),
  eventName: z.string().min(1),
  currentTask: z.string().min(1),
  artifactCount: z.number().int().nonnegative(),
  memoryCount: z.number().int().nonnegative(),
  observations: z.array(
    z.object({
      id: z.string().min(1),
      claim: z.string().min(1),
      origin: z.enum(["observed", "inferred", "told_to_me"]),
      visibility: z.enum(["private", "shareable"]),
      sourceTitle: z.string().nullable(),
      evidenceExcerpt: z.string().nullable(),
    }),
  ),
});

export const workspaceResultSchema = z.object({
  provider: z.enum(["mock", "solari"]),
  sessionId: z.string().min(1),
  volumeId: z.string().min(1),
  snapshotId: z.string().min(1),
  status: z.enum(["ready", "paused", "destroyed"]),
  // A sensitive server-side capability. Never serialize it directly to a client.
  streamCapability: z.url().optional(),
});

export const evaluationObservationSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
});

export const directionalEvaluationRequestSchema = z.object({
  direction: z.string().min(1),
  participantObservations: z.array(evaluationObservationSchema).min(1),
  candidateObservations: z.array(evaluationObservationSchema).min(1),
});

export const directionalEvaluationSchema = z.object({
  recommend: z.boolean(),
  rationale: z.array(
    z.object({
      statement: z.string().min(1),
      supportingObservationIds: z.array(z.string().min(1)).min(1),
    }),
  ),
  uncertainty: z.enum(["low", "medium", "high"]),
  caution: z.string(),
  evaluator: z.enum(["mock", "sandbox-baseline"]),
});

export const repositoryTaskRequestSchema = z.object({
  participantRef: z.string().min(1),
  repositoryUrl: z.url(),
  objective: z.string().trim().min(3).max(800),
});

export const repositoryTaskResultSchema = z.object({
  provider: z.enum(["mock", "solari"]),
  runReference: z.string().min(1),
  repositoryUrl: z.url(),
  projectType: z.enum(["node", "python", "rust", "go", "unknown"]),
  command: z.string(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  summary: z.string(),
});

export type ApprovedSource = z.infer<typeof approvedSourceSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export type ResearchResult = z.infer<typeof researchResultSchema>;
export type WorkspaceManifest = z.infer<typeof workspaceManifestSchema>;
export type WorkspaceResult = z.infer<typeof workspaceResultSchema>;
export type WorkspaceOpenOptions = {
  sessionId?: string | null;
  volumeId: string;
};
export type DirectionalEvaluationRequest = z.infer<
  typeof directionalEvaluationRequestSchema
>;
export type DirectionalEvaluation = z.infer<
  typeof directionalEvaluationSchema
>;
export type RepositoryTaskRequest = z.infer<
  typeof repositoryTaskRequestSchema
>;
export type RepositoryTaskResult = z.infer<
  typeof repositoryTaskResultSchema
>;

export interface BrowserResearchAdapter {
  research(request: ResearchRequest): Promise<ResearchResult>;
}

export interface DesktopWorkspaceAdapter {
  createVolume(participantRef: string): Promise<string>;
  provision(
    manifest: WorkspaceManifest,
    options: WorkspaceOpenOptions,
  ): Promise<WorkspaceResult>;
  checkpoint(sessionId: string, name?: string): Promise<string>;
  pause(sessionId: string): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  deleteVolume(volumeId: string): Promise<void>;
}

export interface SandboxEvaluationAdapter {
  evaluate(
    request: DirectionalEvaluationRequest,
  ): Promise<DirectionalEvaluation>;
}

export interface SandboxTaskAdapter {
  runRepositoryTask(request: RepositoryTaskRequest): Promise<RepositoryTaskResult>;
}

export interface SolariAdapters {
  browser: BrowserResearchAdapter;
  desktop: DesktopWorkspaceAdapter;
  sandbox: SandboxEvaluationAdapter;
  sandboxTask: SandboxTaskAdapter;
}
