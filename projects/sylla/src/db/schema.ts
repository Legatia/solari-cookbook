import {
  boolean,
  index,
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
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    inviteTokenHash: text("invite_token_hash").notNull(),
    displayName: text("display_name"),
    intent: text("intent"),
    ageConfirmed: boolean("age_confirmed").default(false).notNull(),
    status: participantStatus("status").default("invited").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [
    index("participants_event_idx").on(table.eventId),
    uniqueIndex("participants_invite_token_unique").on(table.inviteTokenHash),
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
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    solariDesktopSessionId: text("solari_desktop_session_id"),
    status: workspaceStatus("status").default("unprovisioned").notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    destroyedAt: timestamp("destroyed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("agent_workspaces_participant_unique").on(table.participantId),
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
