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
    uniqueIndex("participants_event_agent_unique").on(
      table.eventId,
      table.agentId,
    ),
    uniqueIndex("participants_invite_token_unique").on(table.inviteTokenHash),
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
    summary: text("summary").notNull(),
    status: memoryStatus("status").default("proposed").notNull(),
    visibility: visibility("visibility").default("private").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    forgottenAt: timestamp("forgotten_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("personal_memories_participant_idx").on(table.participantId)],
);

// Raw debrief text is intentionally absent from the durable schema.
