import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  approvedSources,
  auditEvents,
  entitlements,
  events,
  observations,
  participants,
  personalAgents,
  syllaUsers,
  usageLedger,
} from "../src/db/schema";
import type {
  BrowserResearchAdapter,
  ResearchRequest,
} from "../src/lib/solari/contracts";
import {
  getBrowserResearchProgress,
  prepareBrowserResearch,
  researchNextBrowserSource,
  sweepBrowserResearchRuns,
} from "../src/lib/sylla/browser-research";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";
import {
  acquireRuntimeLease,
  releaseRuntimeLease,
} from "../src/lib/sylla/leases";
import { yieldAgentRunToBackground } from "../src/lib/sylla/runs";

class RecordingBrowserAdapter implements BrowserResearchAdapter {
  readonly visits: string[] = [];

  async research(request: ResearchRequest) {
    assert.equal(request.sources.length, 1);
    const source = request.sources[0]!;
    this.visits.push(source.url);
    return {
      provider: "mock" as const,
      runReference: `recording-browser-${randomUUID()}`,
      evidence: [
        {
          sourceId: source.id,
          sourceUrl: source.url,
          sourceTitle: source.label ?? new URL(source.url).hostname,
          excerpt: `Verified evidence from ${new URL(source.url).hostname}.`,
          observedAt: new Date().toISOString(),
        },
      ],
    };
  }
}

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `browser-handoff-${syntheticId}`;
  let participantId: string | undefined;
  let userId: string | undefined;
  let agentId: string | undefined;

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: eventSlug,
        name: "Synthetic Browser handoff verification",
        status: "open",
      })
      .returning();
    const [participant] = await database
      .insert(participants)
      .values({
        eventId: event.id,
        inviteTokenHash: `browser-handoff-${syntheticId}`,
        displayName: "Synthetic Browser participant",
        ageConfirmed: true,
        status: "invited",
      })
      .returning();
    participantId = participant.id;

    await acceptParticipationConsent(participantId, {
      displayName: "Synthetic Browser participant",
      policyVersion: PARTICIPATION_POLICY_VERSION,
      ageConfirmed: true,
      publicSourceResearch: true,
      privateMemoryStorage: true,
      matchmaking: true,
      hostDataBoundary: true,
      backgroundContinuation: true,
      availability: [
        {
          startsAt: "2026-09-10T18:00:00.000Z",
          endsAt: "2026-09-10T20:00:00.000Z",
          timezone: "Europe/Warsaw",
        },
      ],
    });

    const hostLease = await acquireRuntimeLease({
      participantId,
      clientId: "synthetic-browser-host",
      runId: `browser-host-${syntheticId}`,
      purpose: "Verify resumable Browser research",
      durationSeconds: 60,
    });
    const hostAdapter = new RecordingBrowserAdapter();
    const prepared = await prepareBrowserResearch({
      participantId,
      authorization: hostLease,
      idempotencyKey: `browser-prepare-${syntheticId}`,
      agentName: "Mira",
      focus: "Understand which kinds of work create meaningful connection",
      sources: [
        { url: "https://example.com/about", label: "About" },
        { url: "https://example.org/writing", label: "Writing" },
      ],
      backgroundContinuationAllowed: true,
      fallbackBudgetCredits: 1,
    });
    assert.equal(prepared.totalCount, 2);
    assert.equal(prepared.completedCount, 0);

    const afterHost = await researchNextBrowserSource({
      participantId,
      agentRunId: prepared.run.id,
      authorization: hostLease,
      idempotencyKey: `browser-host-source-${syntheticId}`,
      adapter: hostAdapter,
    });
    assert.equal(afterHost.completedCount, 1);
    assert.equal(hostAdapter.visits.length, 1);

    const blocked = await sweepBrowserResearchRuns({
      limit: 10,
      workerId: "browser-cron-blocked",
      adapter: new RecordingBrowserAdapter(),
    });
    assert.equal(blocked.executed, 0);
    assert.equal(blocked.skipped, 1);

    await yieldAgentRunToBackground({
      participantId,
      agentRunId: prepared.run.id,
      authorization: hostLease,
    });
    const fallbackAdapter = new RecordingBrowserAdapter();
    const swept = await sweepBrowserResearchRuns({
      limit: 10,
      workerId: "browser-cron",
      adapter: fallbackAdapter,
    });
    assert.equal(swept.executed, 1);
    assert.equal(swept.failed, 0);
    assert.equal(fallbackAdapter.visits.length, 1);
    assert.notEqual(fallbackAdapter.visits[0], hostAdapter.visits[0]);

    const complete = await getBrowserResearchProgress(
      participantId,
      prepared.run.id,
    );
    assert.equal(complete.completedCount, 2);
    assert.equal(complete.nextSourceId, null);
    assert.deepEqual(complete.ambiguousSourceIds, []);
    assert.equal(complete.run.status, "completed");
    assert.equal(complete.run.executionMode, "internal_fallback");
    assert.equal(complete.run.handoff?.consequentialActionsTaken, false);
    assert.match(
      complete.run.handoff?.nextAction ?? "",
      /review and approve/i,
    );

    const repeat = await sweepBrowserResearchRuns({
      limit: 10,
      workerId: "browser-cron-repeat",
      adapter: fallbackAdapter,
    });
    assert.equal(repeat.executed, 0);
    assert.equal(fallbackAdapter.visits.length, 1);

    const [identity] = await database
      .select({ userId: participants.userId, agentId: participants.agentId })
      .from(participants)
      .where(eq(participants.id, participantId))
      .limit(1);
    userId = identity?.userId ?? undefined;
    agentId = identity?.agentId ?? undefined;
    assert.ok(userId);
    const settledUsage = await database
      .select()
      .from(usageLedger)
      .where(
        and(
          eq(usageLedger.userId, userId),
          eq(usageLedger.operation, "browser_source"),
          eq(usageLedger.status, "settled"),
        ),
      );
    assert.equal(settledUsage.length, 2);
    const sourceRows = await database
      .select()
      .from(approvedSources)
      .where(eq(approvedSources.participantId, participantId));
    assert.equal(
      sourceRows.filter((source) => source.researchStatus === "complete").length,
      2,
    );
    const proposalRows = await database
      .select()
      .from(observations)
      .where(eq(observations.participantId, participantId));
    assert.ok(proposalRows.length >= 3);

    const postWorkerLease = await acquireRuntimeLease({
      participantId,
      clientId: "post-browser-host",
      runId: `post-browser-${syntheticId}`,
      purpose: "Verify fallback worker released its lease",
      durationSeconds: 30,
    });
    await releaseRuntimeLease(participantId, postWorkerLease);

    console.log(
      JSON.stringify({
        verified: true,
        oneSourcePerHostCall: true,
        activeHostBlockedFallback: true,
        remainingSourceCompletedInBackground: true,
        duplicateVisitCount: 0,
        settledBrowserOperations: settledUsage.length,
        pendingMemoryProposals: proposalRows.length,
        reconnectHandoffCreated: Boolean(complete.run.handoff),
      }),
    );
  } finally {
    if (participantId) {
      await database
        .delete(auditEvents)
        .where(eq(auditEvents.participantId, participantId));
      await database.delete(participants).where(eq(participants.id, participantId));
    }
    if (agentId) {
      await database.delete(personalAgents).where(eq(personalAgents.id, agentId));
    }
    if (userId) {
      await database.delete(entitlements).where(eq(entitlements.userId, userId));
      await database.delete(syllaUsers).where(eq(syllaUsers.id, userId));
    }
    await database.delete(events).where(eq(events.slug, eventSlug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
