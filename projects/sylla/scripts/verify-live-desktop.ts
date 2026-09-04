import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  agentWorkspaces,
  auditEvents,
  events,
  observations,
  participants,
  personalAgents,
  syllaUsers,
} from "../src/db/schema";
import { createSolariAdapters } from "../src/lib/solari";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import { acquireRuntimeLease, releaseRuntimeLease } from "../src/lib/sylla/leases";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";
import { updatePortableAgent } from "../src/lib/sylla/identity";
import {
  loadSessionState,
  retireParticipantWorkspace,
} from "../src/lib/sylla/session";
import {
  checkpointParticipantWorkspace,
  openParticipantWorkspace,
  pauseParticipantWorkspace,
} from "../src/lib/sylla/workspace";

/**
 * The live Desktop lifecycle, end to end against real Solari machines.
 *
 * This is the verification the README has carried as outstanding since the
 * first commit, blocked on `FeatureRequiresPlan`. It provisions a real desktop
 * and a real durable volume, so it costs credits and holds the account's only
 * free-plan slot while it runs.
 */
/**
 * Ask Solari whether a snapshot still exists.
 *
 * Pruning is best-effort by design, which means a wrong endpoint would fail
 * silently and storage would accumulate from October with nothing to see. This
 * is the assertion that catches that.
 */
async function snapshotExists(snapshotId: string) {
  const base = (process.env.SOLARI_BASE_URL ?? "https://api.getsolari.com").replace(
    /\/+$/,
    "",
  );
  const response = await fetch(
    `${base}/snapshots/${encodeURIComponent(snapshotId)}`,
    { headers: { authorization: `Bearer ${process.env.SOLARI_API_KEY}` } },
  );
  return response.status !== 404;
}

async function main() {
  const mode = process.env.INTEGRATION_MODE;
  assert.equal(
    mode,
    "live",
    "Run with INTEGRATION_MODE=live; there is nothing to prove in mock mode.",
  );

  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `live-desktop-${syntheticId}`;
  let participantId: string | undefined;
  let eventId: string | undefined;
  let lease: Awaited<ReturnType<typeof acquireRuntimeLease>> | undefined;
  const observed: Record<string, unknown> = {};

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: eventSlug,
        name: "Synthetic live desktop event",
        status: "open",
        startsAt: new Date("2026-09-10T18:00:00.000Z"),
      })
      .returning();
    eventId = event.id;

    const invitation = await createEventInvitation({
      eventId,
      label: "Live desktop",
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    ({ participantId } = await redeemEventInvitation(invitation.token));
    await acceptParticipationConsent(participantId, {
      displayName: "Synthetic desktop participant",
      policyVersion: PARTICIPATION_POLICY_VERSION,
      ageConfirmed: true,
      publicSourceResearch: true,
      privateMemoryStorage: true,
      matchmaking: false,
      hostDataBoundary: true,
      backgroundContinuation: false,
      availability: [],
    });
    await updatePortableAgent(participantId, {
      agentName: "Mira",
      focus: "Prove the workbench rebuilds from approved memory alone",
    });

    // The workbench is materialized from approved state, so give it some.
    await database.insert(observations).values([
      {
        participantId,
        claim: "Runs a small reading group on Thursday evenings.",
        origin: "told_to_me",
        status: "confirmed",
        visibility: "private",
      },
      {
        participantId,
        claim: "This one was forgotten and must not appear on the workbench.",
        origin: "inferred",
        status: "forgotten",
        visibility: "private",
      },
    ]);

    const adapters = await createSolariAdapters();
    lease = await acquireRuntimeLease({
      participantId,
      clientId: "verify-live-desktop",
      runId: `live-desktop-${syntheticId}`,
      purpose: "Verify the live Desktop lifecycle",
      durationSeconds: 300,
    });
    const context = {
      authorization: {
        clientId: "verify-live-desktop",
        runId: lease.runId,
        leaseToken: lease.leaseToken,
      },
      idempotencyKey: `live-desktop-open-${syntheticId}`,
      adapters,
    };

    // 1. Open: durable volume, desktop, readiness poll, manifest, snapshot.
    const opened = await openParticipantWorkspace(participantId, context);
    const workspace = opened.state.workspace;
    assert.ok(workspace?.sessionId, "a live desktop session exists");
    assert.ok(workspace?.volumeId, "a durable volume exists");
    assert.equal(workspace?.provider, "solari", "not the mock adapter");
    observed.provider = workspace?.provider;
    observed.hasStreamCapability = Boolean(opened.streamCapability);
    const firstSnapshot = workspace?.snapshotId ?? null;
    observed.recoverySnapshotOnOpen = Boolean(firstSnapshot);

    // 2. Checkpoint on a running machine, which also prunes its predecessor.
    const afterCheckpoint = await checkpointParticipantWorkspace(participantId, {
      ...context,
      idempotencyKey: `live-desktop-checkpoint-${syntheticId}`,
    });
    const secondSnapshot = afterCheckpoint.workspace?.snapshotId ?? null;
    assert.ok(secondSnapshot, "a checkpoint snapshot exists");
    assert.notEqual(
      secondSnapshot,
      firstSnapshot,
      "a checkpoint is a new snapshot, not a rename",
    );
    observed.checkpointReplacedSnapshot = true;

    // The replaced snapshot must actually be gone from Solari, not merely
    // forgotten by Sylla. Storage is billed whether or not we still track it.
    assert.ok(await snapshotExists(secondSnapshot), "the live snapshot is retained");
    assert.equal(
      await snapshotExists(firstSnapshot!),
      false,
      "the snapshot the checkpoint replaced was not pruned",
    );
    observed.replacedSnapshotPruned = true;

    // 3. Pause snapshots first, then pauses. Order matters: Solari refuses a
    //    snapshot on a paused machine.
    const paused = await pauseParticipantWorkspace(participantId, {
      ...context,
      idempotencyKey: `live-desktop-pause-${syntheticId}`,
    });
    assert.equal(paused.workspace?.status, "paused");
    const pauseSnapshot = paused.workspace?.snapshotId ?? null;
    observed.pausedWithSnapshot = Boolean(pauseSnapshot);
    assert.equal(
      await snapshotExists(secondSnapshot),
      false,
      "pausing must prune the checkpoint it superseded",
    );

    // 4. The guard added for the new 409: refuse before spending a credit.
    await assert.rejects(
      checkpointParticipantWorkspace(participantId, {
        ...context,
        idempotencyKey: `live-desktop-paused-checkpoint-${syntheticId}`,
      }),
      /resting|resume/i,
      "checkpointing a paused workspace must be refused locally",
    );
    observed.pausedCheckpointRefusedLocally = true;

    const state = await loadSessionState(participantId);
    observed.workbenchExcludesForgotten = !JSON.stringify(state.workspace).includes(
      "must not appear",
    );

    console.log(
      JSON.stringify({ verified: true, ...observed }, null, 0),
    );
  } finally {
    // Always tear the machine down: a leaked desktop holds the only slot.
    if (participantId) {
      await retireParticipantWorkspace(participantId).catch((error: unknown) => {
        console.error("workspace teardown failed:", error);
      });
      if (lease) {
        await releaseRuntimeLease(participantId, {
          clientId: "verify-live-desktop",
          runId: lease.runId,
          leaseToken: lease.leaseToken,
        }).catch(() => undefined);
      }
      const [row] = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);
      await database
        .delete(agentWorkspaces)
        .where(eq(agentWorkspaces.participantId, participantId));
      await database
        .delete(observations)
        .where(eq(observations.participantId, participantId));
      await database
        .delete(auditEvents)
        .where(eq(auditEvents.participantId, participantId));
      await database.delete(participants).where(eq(participants.id, participantId));
      if (row?.agentId) {
        await database.delete(personalAgents).where(eq(personalAgents.id, row.agentId));
      }
      if (row?.userId) {
        await database.delete(syllaUsers).where(eq(syllaUsers.id, row.userId));
      }
    }
    if (eventId) {
      await database.delete(auditEvents).where(eq(auditEvents.eventId, eventId));
    }
    await database.delete(events).where(eq(events.slug, eventSlug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
