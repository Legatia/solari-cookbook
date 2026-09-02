import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const eventStatus = pgEnum("event_status", [
  "draft",
  "open",
  "matching",
  "complete",
  "archived",
]);

export const participantStatus = pgEnum("participant_status", [
  "invited",
  "onboarding",
  "ready",
  "withdrawn",
]);

export const observationOrigin = pgEnum("observation_origin", [
  "observed",
  "inferred",
  "told_to_me",
]);

export const observationStatus = pgEnum("observation_status", [
  "pending",
  "confirmed",
  "edited",
  "forgotten",
]);

export const visibility = pgEnum("visibility", ["private", "shareable"]);

export const workspaceStatus = pgEnum("workspace_status", [
  "unprovisioned",
  "starting",
  "ready",
  "paused",
  "destroyed",
  "failed",
]);

export const memoryStatus = pgEnum("memory_status", [
  "proposed",
  "approved",
  "edited",
  "forgotten",
]);

export const entitlementStatus = pgEnum("entitlement_status", [
  "trialing",
  "active",
  "inactive",
  "exhausted",
  "canceled",
]);

export const usageStatus = pgEnum("usage_status", [
  "reserved",
  "settled",
  "released",
  "declined",
]);

export const checkoutStatus = pgEnum("checkout_status", [
  "pending",
  "completed",
  "expired",
  "canceled",
]);

export const agentRunStatus = pgEnum("agent_run_status", [
  "host_orchestrated",
  "waiting_for_host",
  "fallback_running",
  "completed",
  "canceled",
  "failed",
]);

export const orchestrationMode = pgEnum("orchestration_mode", [
  "host_orchestrated",
  "deterministic_background",
  "internal_fallback",
]);

export const auditActorType = pgEnum("audit_actor_type", [
  "participant",
  "organizer",
  "system",
]);

export const matchingRunStatus = pgEnum("matching_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const candidatePairStatus = pgEnum("candidate_pair_status", [
  "shortlisted",
  "evaluating",
  "recommended",
  "rejected",
  "expired",
  "canceled",
]);

export const directionalEvaluationStatus = pgEnum(
  "directional_evaluation_status",
  ["running", "completed", "failed"],
);

export const introductionProposalStatus = pgEnum(
  "introduction_proposal_status",
  ["waiting", "matched", "declined", "expired", "canceled", "completed"],
);

export const introductionDecision = pgEnum("introduction_decision", [
  "accepted",
  "declined",
]);

export const outcomeAnswer = pgEnum("outcome_answer", ["yes", "no", "unsure"]);

export const debriefDisposition = pgEnum("debrief_disposition", [
  "skipped",
  "quick",
  "private_host_conversation",
]);

export const syllaUsers = pgTable("sylla_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const personalAgents = pgTable(
  "personal_agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => syllaUsers.id, { onDelete: "cascade" }),
    name: text("name"),
    focus: text("focus"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("personal_agents_owner_user_unique").on(table.ownerUserId),
  ],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => syllaUsers.id, { onDelete: "cascade" }),
    planKey: text("plan_key").default("starter-trial").notNull(),
    status: entitlementStatus("status").default("trialing").notNull(),
    creditLimit: integer("credit_limit").default(500).notNull(),
    creditsUsed: integer("credits_used").default(0).notNull(),
    creditsReserved: integer("credits_reserved").default(0).notNull(),
    periodStartedAt: timestamp("period_started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    periodEndsAt: timestamp("period_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("entitlements_user_unique").on(table.userId)],
);

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => syllaUsers.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => personalAgents.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    estimatedCredits: integer("estimated_credits").notNull(),
    actualCredits: integer("actual_credits"),
    status: usageStatus("status").default("reserved").notNull(),
    provider: text("provider").default("solari").notNull(),
    providerReference: text("provider_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    index("usage_ledger_user_idx").on(table.userId),
    index("usage_ledger_agent_idx").on(table.agentId),
    uniqueIndex("usage_ledger_idempotency_unique").on(table.idempotencyKey),
  ],
);

export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => syllaUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    planKey: text("plan_key").default("starter").notNull(),
    status: checkoutStatus("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("checkout_sessions_user_idx").on(table.userId),
    uniqueIndex("checkout_sessions_token_unique").on(table.tokenHash),
  ],
);

export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => syllaUsers.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("billing_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
  ],
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => syllaUsers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_identities_user_idx").on(table.userId),
    uniqueIndex("auth_identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
  ],
);

export const hostConnections = pgTable(
  "host_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => syllaUsers.id, { onDelete: "cascade" }),
    authIdentityId: uuid("auth_identity_id")
      .notNull()
      .references(() => authIdentities.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("host_connections_user_idx").on(table.userId),
    uniqueIndex("host_connections_identity_client_unique").on(
      table.authIdentityId,
      table.clientId,
    ),
  ],
);

export const oauthClients = pgTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientName: text("client_name"),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  grantTypes: jsonb("grant_types")
    .$type<string[]>()
    .default(["authorization_code", "refresh_token"])
    .notNull(),
  responseTypes: jsonb("response_types")
    .$type<string[]>()
    .default(["code"])
    .notNull(),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method")
    .default("none")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const oauthAuthorizationCodes = pgTable(
  "oauth_authorization_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codeHash: text("code_hash").notNull(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    resource: text("resource").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("oauth_authorization_codes_hash_unique").on(table.codeHash),
    index("oauth_authorization_codes_participant_idx").on(table.participantId),
    index("oauth_authorization_codes_client_idx").on(table.clientId),
  ],
);

export const oauthAccessTokens = pgTable(
  "oauth_access_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", {
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("oauth_access_tokens_access_hash_unique").on(
      table.accessTokenHash,
    ),
    uniqueIndex("oauth_access_tokens_refresh_hash_unique").on(
      table.refreshTokenHash,
    ),
    index("oauth_access_tokens_participant_idx").on(table.participantId),
    index("oauth_access_tokens_client_idx").on(table.clientId),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    city: text("city"),
    venue: text("venue"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    status: eventStatus("status").default("draft").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("events_slug_unique").on(table.slug)],
);

export const eventInvitations = pgTable(
  "event_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    maxUses: integer("max_uses").default(1).notNull(),
    useCount: integer("use_count").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("event_invitations_event_idx").on(table.eventId),
    uniqueIndex("event_invitations_token_unique").on(table.tokenHash),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => syllaUsers.id, {
      onDelete: "restrict",
    }),
    agentId: uuid("agent_id").references(() => personalAgents.id, {
      onDelete: "restrict",
    }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id").references(() => eventInvitations.id, {
      onDelete: "set null",
    }),
    inviteTokenHash: text("invite_token_hash").notNull(),
    displayName: text("display_name"),
    agentName: text("agent_name"),
    intent: text("intent"),
    researchProvider: text("research_provider"),
    researchRunReference: text("research_run_reference"),
    researchCompletedAt: timestamp("research_completed_at", {
      withTimezone: true,
    }),
    ageConfirmed: boolean("age_confirmed").default(false).notNull(),
    status: participantStatus("status").default("invited").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [
    index("participants_event_idx").on(table.eventId),
    index("participants_user_idx").on(table.userId),
    index("participants_agent_idx").on(table.agentId),
    index("participants_invitation_idx").on(table.invitationId),
    uniqueIndex("participants_event_agent_unique").on(
      table.eventId,
      table.agentId,
    ),
    uniqueIndex("participants_invite_token_unique").on(table.inviteTokenHash),
  ],
);

export const participantConsents = pgTable(
  "participant_consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    policyVersion: text("policy_version").notNull(),
    ageConfirmed: boolean("age_confirmed").notNull(),
    publicSourceResearch: boolean("public_source_research").notNull(),
    privateMemoryStorage: boolean("private_memory_storage").notNull(),
    matchmaking: boolean("matchmaking").notNull(),
    hostDataBoundary: boolean("host_data_boundary").notNull(),
    backgroundContinuation: boolean("background_continuation")
      .default(false)
      .notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [
    index("participant_consents_participant_idx").on(table.participantId),
    uniqueIndex("participant_consents_version_unique").on(
      table.participantId,
      table.policyVersion,
    ),
  ],
);

export const availabilityWindows = pgTable(
  "availability_windows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("availability_windows_participant_idx").on(table.participantId),
    index("availability_windows_range_idx").on(table.startsAt, table.endsAt),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "set null",
    }),
    actorType: auditActorType("actor_type").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_event_idx").on(table.eventId),
    index("audit_events_participant_idx").on(table.participantId),
    index("audit_events_action_idx").on(table.action),
  ],
);

export const runtimeLeases = pgTable(
  "runtime_leases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => personalAgents.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    ownerClientId: text("owner_client_id").notNull(),
    ownerRunId: text("owner_run_id").notNull(),
    ownerKind: text("owner_kind").default("host").notNull(),
    leaseTokenHash: text("lease_token_hash").notNull(),
    purpose: text("purpose").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("runtime_leases_agent_unique").on(table.agentId),
    uniqueIndex("runtime_leases_token_unique").on(table.leaseTokenHash),
    index("runtime_leases_participant_idx").on(table.participantId),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => syllaUsers.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => personalAgents.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    hostRunId: text("host_run_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    purpose: text("purpose").notNull(),
    approvedTaskType: text("approved_task_type").notNull(),
    approvedScope: jsonb("approved_scope")
      .$type<{ allowedActions: string[]; evidenceRefs: string[] }>()
      .notNull(),
    status: agentRunStatus("status").default("host_orchestrated").notNull(),
    executionMode: orchestrationMode("execution_mode")
      .default("host_orchestrated")
      .notNull(),
    backgroundContinuationAllowed: boolean("background_continuation_allowed")
      .default(false)
      .notNull(),
    fallbackBudgetCredits: integer("fallback_budget_credits")
      .default(0)
      .notNull(),
    fallbackCreditsUsed: integer("fallback_credits_used").default(0).notNull(),
    checkpointSequence: integer("checkpoint_sequence").default(0).notNull(),
    lastHostClientId: text("last_host_client_id").notNull(),
    fallbackReason: text("fallback_reason"),
    fallbackWorkerRunId: text("fallback_worker_run_id"),
    fallbackProvider: text("fallback_provider"),
    fallbackModel: text("fallback_model"),
    fallbackError: text("fallback_error"),
    fallbackClaimedAt: timestamp("fallback_claimed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_runs_agent_idx").on(table.agentId),
    index("agent_runs_participant_idx").on(table.participantId),
    index("agent_runs_status_idx").on(table.status),
    uniqueIndex("agent_runs_participant_idempotency_unique").on(
      table.participantId,
      table.idempotencyKey,
    ),
  ],
);

export const runCheckpoints = pgTable(
  "run_checkpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    resumableState: jsonb("resumable_state")
      .$type<{
        completedActions: string[];
        nextAction: string | null;
        evidenceRefs: string[];
      }>()
      .notNull(),
    createdBy: orchestrationMode("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("run_checkpoints_run_idx").on(table.agentRunId),
    uniqueIndex("run_checkpoints_run_sequence_unique").on(
      table.agentRunId,
      table.sequence,
    ),
  ],
);

export const runHandoffs = pgTable(
  "run_handoffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    checkpointId: uuid("checkpoint_id").references(() => runCheckpoints.id, {
      onDelete: "set null",
    }),
    fromMode: orchestrationMode("from_mode").notNull(),
    toMode: orchestrationMode("to_mode").notNull(),
    reason: text("reason").notNull(),
    summary: text("summary").notNull(),
    details: jsonb("details")
      .$type<{
        completedActions: string[];
        nextAction: string | null;
        fallbackCreditsUsed: number;
        consequentialActionsTaken: boolean;
        modelProvider: string;
        model: string | null;
        modelInputTokens: number | null;
        modelOutputTokens: number | null;
        deterministicRecoveryUsed: boolean;
      }>()
      .notNull(),
    claimedBy: text("claimed_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("run_handoffs_run_unique").on(table.agentRunId),
    index("run_handoffs_checkpoint_idx").on(table.checkpointId),
  ],
);

export const approvedSources = pgTable(
  "approved_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label"),
    extractedTitle: text("extracted_title"),
    evidenceExcerpt: text("evidence_excerpt"),
    researchStatus: text("research_status").default("approved").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("approved_sources_participant_idx").on(table.participantId)],
);

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => approvedSources.id, {
      onDelete: "set null",
    }),
    claim: text("claim").notNull(),
    evidenceExcerpt: text("evidence_excerpt"),
    origin: observationOrigin("origin").notNull(),
    status: observationStatus("status").default("pending").notNull(),
    visibility: visibility("visibility").default("private").notNull(),
    confidence: text("confidence"),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("observations_participant_idx").on(table.participantId)],
);

export const participantBlocks = pgTable(
  "participant_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockerParticipantId: uuid("blocker_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    blockedParticipantId: uuid("blocked_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("participant_blocks_blocker_idx").on(table.blockerParticipantId),
    index("participant_blocks_blocked_idx").on(table.blockedParticipantId),
    uniqueIndex("participant_blocks_pair_unique").on(
      table.blockerParticipantId,
      table.blockedParticipantId,
    ),
  ],
);

export const matchingRuns = pgTable(
  "matching_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: matchingRunStatus("status").default("pending").notNull(),
    candidateCount: integer("candidate_count").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("matching_runs_event_idx").on(table.eventId),
    uniqueIndex("matching_runs_event_idempotency_unique").on(
      table.eventId,
      table.idempotencyKey,
    ),
  ],
);

export const candidatePairs = pgTable(
  "candidate_pairs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    matchingRunId: uuid("matching_run_id").references(() => matchingRuns.id, {
      onDelete: "set null",
    }),
    participantLowId: uuid("participant_low_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    participantHighId: uuid("participant_high_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    status: candidatePairStatus("status").default("shortlisted").notNull(),
    retrievalEvidence: jsonb("retrieval_evidence")
      .$type<{
        lowObservationIds: string[];
        highObservationIds: string[];
        availabilityWindowIds: string[];
        explanation: string;
      }>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("candidate_pairs_event_idx").on(table.eventId),
    index("candidate_pairs_low_idx").on(table.participantLowId),
    index("candidate_pairs_high_idx").on(table.participantHighId),
    uniqueIndex("candidate_pairs_event_participants_unique").on(
      table.eventId,
      table.participantLowId,
      table.participantHighId,
    ),
  ],
);

export const directionalEvaluations = pgTable(
  "directional_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidatePairId: uuid("candidate_pair_id")
      .notNull()
      .references(() => candidatePairs.id, { onDelete: "cascade" }),
    subjectParticipantId: uuid("subject_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    candidateParticipantId: uuid("candidate_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: directionalEvaluationStatus("status").default("running").notNull(),
    orchestrator: text("orchestrator").notNull(),
    provider: text("provider"),
    policyVersion: text("policy_version").notNull(),
    subjectObservationIds: jsonb("subject_observation_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    candidateObservationIds: jsonb("candidate_observation_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    result: jsonb("result").$type<{
      recommend: boolean;
      rationale: Array<{
        statement: string;
        supportingObservationIds: string[];
      }>;
      uncertainty: "low" | "medium" | "high";
      caution: string;
      evaluator: "mock" | "sandbox-baseline";
    }>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("directional_evaluations_pair_idx").on(table.candidatePairId),
    index("directional_evaluations_subject_idx").on(table.subjectParticipantId),
    uniqueIndex("directional_evaluations_pair_subject_unique").on(
      table.candidatePairId,
      table.subjectParticipantId,
    ),
    uniqueIndex("directional_evaluations_idempotency_unique").on(
      table.idempotencyKey,
    ),
  ],
);

export const disclosureEnvelopes = pgTable(
  "disclosure_envelopes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidatePairId: uuid("candidate_pair_id")
      .notNull()
      .references(() => candidatePairs.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    observationIds: jsonb("observation_ids").$type<string[]>().notNull(),
    policyVersion: text("policy_version").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("disclosure_envelopes_pair_idx").on(table.candidatePairId),
    index("disclosure_envelopes_participant_idx").on(table.participantId),
    uniqueIndex("disclosure_envelopes_pair_participant_unique").on(
      table.candidatePairId,
      table.participantId,
    ),
  ],
);

export const introductionProposals = pgTable(
  "introduction_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidatePairId: uuid("candidate_pair_id")
      .notNull()
      .references(() => candidatePairs.id, { onDelete: "cascade" }),
    status: introductionProposalStatus("status").default("waiting").notNull(),
    meetingArea: text("meeting_area").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("introduction_proposals_pair_unique").on(table.candidatePairId),
    index("introduction_proposals_status_idx").on(table.status),
  ],
);

export const introductionResponses = pgTable(
  "introduction_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    introductionProposalId: uuid("introduction_proposal_id")
      .notNull()
      .references(() => introductionProposals.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    decision: introductionDecision("decision").notNull(),
    blockRequested: boolean("block_requested").default(false).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("introduction_responses_proposal_idx").on(
      table.introductionProposalId,
    ),
    uniqueIndex("introduction_responses_proposal_participant_unique").on(
      table.introductionProposalId,
      table.participantId,
    ),
  ],
);

export const introductionOutcomes = pgTable(
  "introduction_outcomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    introductionProposalId: uuid("introduction_proposal_id")
      .notNull()
      .references(() => introductionProposals.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    met: boolean("met").notNull(),
    worthwhile: outcomeAnswer("worthwhile"),
    meetAgain: outcomeAnswer("meet_again"),
    alreadyKnew: boolean("already_knew").notNull(),
    wouldHaveMetWithoutSylla: outcomeAnswer("would_have_met_without_sylla")
      .notNull(),
    contactExchanged: boolean("contact_exchanged").default(false).notNull(),
    secondInteractionPlanned: boolean("second_interaction_planned")
      .default(false)
      .notNull(),
    wantsAnotherIntroduction: boolean("wants_another_introduction")
      .default(false)
      .notNull(),
    debriefDisposition: debriefDisposition("debrief_disposition").notNull(),
    proposedMemoryCount: integer("proposed_memory_count").default(0).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("introduction_outcomes_proposal_idx").on(
      table.introductionProposalId,
    ),
    index("introduction_outcomes_participant_idx").on(table.participantId),
    uniqueIndex("introduction_outcomes_proposal_participant_unique").on(
      table.introductionProposalId,
      table.participantId,
    ),
  ],
);

export const agentWorkspaces = pgTable(
  "agent_workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id").references(() => personalAgents.id, {
      onDelete: "cascade",
    }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    solariDesktopSessionId: text("solari_desktop_session_id"),
    solariVolumeId: text("solari_volume_id"),
    solariSnapshotId: text("solari_snapshot_id"),
    provider: text("provider"),
    status: workspaceStatus("status").default("unprovisioned").notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    destroyedAt: timestamp("destroyed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("agent_workspaces_participant_unique").on(table.participantId),
    uniqueIndex("agent_workspaces_agent_unique").on(table.agentId),
  ],
);

export const workspaceArtifacts = pgTable(
  "workspace_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => agentWorkspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    sourceObservationIds: jsonb("source_observation_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("workspace_artifacts_workspace_idx").on(table.workspaceId)],
);

export const personalMemories = pgTable(
  "personal_memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    introductionOutcomeId: uuid("introduction_outcome_id").references(
      () => introductionOutcomes.id,
      { onDelete: "set null" },
    ),
    summary: text("summary").notNull(),
    status: memoryStatus("status").default("proposed").notNull(),
    visibility: visibility("visibility").default("private").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    forgottenAt: timestamp("forgotten_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("personal_memories_participant_idx").on(table.participantId),
    index("personal_memories_outcome_idx").on(table.introductionOutcomeId),
  ],
);

// Raw debrief text is intentionally absent from the durable schema.
