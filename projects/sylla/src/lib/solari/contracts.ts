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

export const browserComputerActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.url() }),
  z.object({ type: z.literal("click"), ref: z.string().min(1).max(40) }),
  z.object({
    type: z.literal("fill"),
    ref: z.string().min(1).max(40),
    value: z.string().max(4_000),
  }),
  z.object({
    type: z.literal("press"),
    ref: z.string().min(1).max(40).optional(),
    key: z.string().min(1).max(40),
  }),
  z.object({
    type: z.literal("select"),
    ref: z.string().min(1).max(40),
    value: z.string().max(500),
  }),
  z.object({ type: z.literal("check"), ref: z.string().min(1).max(40) }),
  z.object({ type: z.literal("back") }),
  z.object({
    type: z.literal("wait"),
    milliseconds: z.number().int().min(100).max(5_000),
  }),
]);

export const browserComputerRequestSchema = z.object({
  participantRef: z.string().min(1),
  profileId: z.string().min(1).optional(),
  startUrl: z.url(),
  allowedOrigins: z.array(z.url()).min(1).max(6),
  actions: z.array(browserComputerActionSchema).max(12),
});

const browserControlSchema = z.object({
  ref: z.string().min(1),
  role: z.string().min(1),
  text: z.string(),
  href: z.string().optional(),
  inputType: z.string().optional(),
  placeholder: z.string().optional(),
  disabled: z.boolean(),
  sensitive: z.boolean(),
});

export const browserComputerResultSchema = z.object({
  provider: z.enum(["mock", "solari"]),
  runReference: z.string().min(1),
  profileId: z.string().min(1),
  page: z.object({
    url: z.url(),
    title: z.string(),
    text: z.string(),
    controls: z.array(browserControlSchema),
  }),
  humanCheckpoint: z
    .object({
      required: z.boolean(),
      reason: z.string().nullable(),
    })
    .nullable(),
  actionsCompleted: z.number().int().nonnegative(),
  profileSaved: z.boolean(),
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
export type BrowserComputerAction = z.infer<typeof browserComputerActionSchema>;
export type BrowserComputerRequest = z.infer<typeof browserComputerRequestSchema>;
export type BrowserComputerResult = z.infer<typeof browserComputerResultSchema>;
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

export interface BrowserComputerAdapter {
  operate(request: BrowserComputerRequest): Promise<BrowserComputerResult>;
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
  browserComputer: BrowserComputerAdapter;
  desktop: DesktopWorkspaceAdapter;
  sandbox: SandboxEvaluationAdapter;
  sandboxTask: SandboxTaskAdapter;
}
