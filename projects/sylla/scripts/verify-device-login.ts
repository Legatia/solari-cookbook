import "../env-config";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  deviceLoginRequests,
  events,
  participants,
  personalAgents,
  syllaUsers,
  userSessions,
} from "../src/db/schema";
import {
  approveDeviceLoginRequest,
  createDeviceLoginRequest,
  denyDeviceLoginRequest,
  DeviceLoginError,
  readDeviceLoginStatus,
  redeemDeviceLogin,
  reviewDeviceLoginRequest,
} from "../src/lib/sylla/device-login";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import { acquireRuntimeLease } from "../src/lib/sylla/leases";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";

/** Recompute the stored lookup hash for a displayed code, for assertions only. */
function userCodeHash(displayedCode: string) {
  return createHash("sha256").update(displayedCode.replace("-", "")).digest("hex");
}

const CHROME_ON_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function browserRequest() {
  return new NextRequest("https://sylla.example/api/auth/device", {
    headers: {
      "user-agent": CHROME_ON_MAC,
      "x-vercel-ip-city": "Berlin",
      "x-vercel-ip-country": "DE",
      "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
    },
  });
}

async function seedParticipant(syntheticId: string, eventId: string, name: string) {
  const invitation = await createEventInvitation({
    eventId,
    label: `Device login ${name}`,
    maxUses: 1,
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
  });
  const { participantId } = await redeemEventInvitation(invitation.token);
  await acceptParticipationConsent(participantId, {
    displayName: `Synthetic ${name} ${syntheticId.slice(0, 8)}`,
    policyVersion: PARTICIPATION_POLICY_VERSION,
    ageConfirmed: true,
    publicSourceResearch: true,
    privateMemoryStorage: true,
    matchmaking: false,
    hostDataBoundary: true,
    backgroundContinuation: true,
    availability: [],
  });
  return participantId;
}

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `device-login-${syntheticId}`;
  const participantIds: string[] = [];
  const requestIds: string[] = [];
  let eventId: string | undefined;

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: eventSlug,
        name: "Synthetic device login event",
        status: "open",
        startsAt: new Date("2026-09-10T18:00:00.000Z"),
      })
      .returning();
    eventId = event.id;

    const ownerId = await seedParticipant(syntheticId, eventId, "owner");
    const strangerId = await seedParticipant(syntheticId, eventId, "stranger");
    participantIds.push(ownerId, strangerId);

    // 1. The browser gets a code, and the device context is server-derived.
    const started = await createDeviceLoginRequest(browserRequest());
    assert.match(started.userCode, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const [stored] = await database
      .select()
      .from(deviceLoginRequests)
      .where(eq(deviceLoginRequests.userCodeHash, userCodeHash(started.userCode)))
      .limit(1);
    assert.ok(stored, "the request is persisted");
    requestIds.push(stored.id);
    assert.equal(stored.deviceLabel, "Chrome on macOS");
    assert.equal(stored.requestLocation, "Berlin, DE");
    assert.ok(stored.requestIpHash && !stored.requestIpHash.includes("198.51.100"));
    const pendingSeconds = Math.round(
      (stored.expiresAt.getTime() - stored.createdAt.getTime()) / 1_000,
    );
    assert.ok(
      pendingSeconds >= 175 && pendingSeconds <= 185,
      `pending code holds the long clock, got ${pendingSeconds}s`,
    );

    // 2. Polling before approval reveals nothing and signs nobody in.
    const pendingStatus = await readDeviceLoginStatus(started.deviceCode);
    assert.equal(pendingStatus.status, "pending");
    await assert.rejects(redeemDeviceLogin(started.deviceCode), DeviceLoginError);

    // 3. Review is read-only: it returns context and leaves the request pending.
    const reviewed = await reviewDeviceLoginRequest({
      participantId: ownerId,
      rawUserCode: started.userCode,
    });
    assert.equal(reviewed.deviceLabel, "Chrome on macOS");
    assert.equal(reviewed.location, "Berlin, DE");
    assert.ok(reviewed.grants.length > 0);
    assert.equal(
      (await readDeviceLoginStatus(started.deviceCode)).status,
      "pending",
      "review must not approve",
    );

    // 4. Approval refuses a background lease and requires a human host lease.
    const backgroundLease = await acquireRuntimeLease({
      participantId: ownerId,
      clientId: "synthetic-worker",
      runId: `device-login-bg-${syntheticId}`,
      purpose: "Verify background refusal",
      durationSeconds: 120,
      ownerKind: "internal",
    });
    await assert.rejects(
      approveDeviceLoginRequest({
        participantId: ownerId,
        clientId: "synthetic-worker",
        rawUserCode: started.userCode,
        authorization: {
          clientId: "synthetic-worker",
          runId: backgroundLease.runId,
          leaseToken: backgroundLease.leaseToken,
        },
      }),
      /human-controlled host lease/,
      "an internal lease cannot sign a browser in",
    );

    const hostLease = await acquireRuntimeLease({
      participantId: ownerId,
      clientId: "synthetic-host",
      runId: `device-login-host-${syntheticId}`,
      purpose: "Verify device login approval",
      durationSeconds: 120,
      allowTakeover: true,
    });
    const authorization = {
      clientId: "synthetic-host",
      runId: hostLease.runId,
      leaseToken: hostLease.leaseToken,
    };
    await approveDeviceLoginRequest({
      participantId: ownerId,
      clientId: "synthetic-host",
      rawUserCode: started.userCode,
      authorization,
    });

    // 5. Approval swaps the long clock for the short one.
    const [afterApproval] = await database
      .select()
      .from(deviceLoginRequests)
      .where(eq(deviceLoginRequests.id, stored.id))
      .limit(1);
    assert.ok(afterApproval.approvedAt);
    const approvalSeconds = Math.round(
      (afterApproval.expiresAt.getTime() - afterApproval.approvedAt.getTime()) / 1_000,
    );
    assert.equal(approvalSeconds, 40, "approval opens a 40 second redeem window");
    assert.ok(
      afterApproval.expiresAt < stored.expiresAt,
      "approval shortens the deadline rather than extending it",
    );

    // 6. Polling now names the agent so the browser can confirm before entering.
    const approvedStatus = await readDeviceLoginStatus(started.deviceCode);
    assert.equal(approvedStatus.status, "approved");
    const [ownerParticipant] = await database
      .select({ userId: participants.userId })
      .from(participants)
      .where(eq(participants.id, ownerId))
      .limit(1);
    assert.ok(ownerParticipant?.userId);

    // 7. Redemption creates exactly one session and cannot be replayed.
    const session = await redeemDeviceLogin(started.deviceCode);
    assert.equal(session.participant.id, ownerId);
    await assert.rejects(redeemDeviceLogin(started.deviceCode), DeviceLoginError);
    const sessions = await database
      .select()
      .from(userSessions)
      .where(eq(userSessions.participantId, ownerId));
    assert.equal(sessions.length, 1, "a device login mints one session, not two");

    // 8. A second request cannot be approved twice, by anyone.
    const contested = await createDeviceLoginRequest(browserRequest());
    const [contestedRow] = await database
      .select()
      .from(deviceLoginRequests)
      .where(eq(deviceLoginRequests.userCodeHash, userCodeHash(contested.userCode)))
      .limit(1);
    requestIds.push(contestedRow.id);
    await approveDeviceLoginRequest({
      participantId: ownerId,
      clientId: "synthetic-host",
      rawUserCode: contested.userCode,
      authorization,
    });
    const strangerLease = await acquireRuntimeLease({
      participantId: strangerId,
      clientId: "synthetic-host-2",
      runId: `device-login-stranger-${syntheticId}`,
      purpose: "Verify second approval refusal",
      durationSeconds: 120,
    });
    await assert.rejects(
      approveDeviceLoginRequest({
        participantId: strangerId,
        clientId: "synthetic-host-2",
        rawUserCode: contested.userCode,
        authorization: {
          clientId: "synthetic-host-2",
          runId: strangerLease.runId,
          leaseToken: strangerLease.leaseToken,
        },
      }),
      DeviceLoginError,
      "an approved request cannot be re-bound to another account",
    );

    // 9. Denial closes a request permanently.
    const denied = await createDeviceLoginRequest(browserRequest());
    const [deniedRow] = await database
      .select()
      .from(deviceLoginRequests)
      .where(eq(deviceLoginRequests.userCodeHash, userCodeHash(denied.userCode)))
      .limit(1);
    requestIds.push(deniedRow.id);
    await denyDeviceLoginRequest({
      participantId: ownerId,
      rawUserCode: denied.userCode,
      authorization,
    });
    assert.equal((await readDeviceLoginStatus(denied.deviceCode)).status, "denied");
    await assert.rejects(redeemDeviceLogin(denied.deviceCode), DeviceLoginError);

    // 10. Every approval, denial, and completion is auditable.
    const actions = (
      await database
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(eq(auditEvents.participantId, ownerId))
    ).map((row) => row.action);
    for (const action of [
      "device_login.approved",
      "device_login.denied",
      "device_login.completed",
    ]) {
      assert.ok(actions.includes(action), `${action} is recorded`);
    }

    // 11. An approved request that is not confirmed in time is dead.
    const lapsed = await createDeviceLoginRequest(browserRequest());
    const [lapsedRow] = await database
      .select()
      .from(deviceLoginRequests)
      .where(eq(deviceLoginRequests.userCodeHash, userCodeHash(lapsed.userCode)))
      .limit(1);
    requestIds.push(lapsedRow.id);
    await approveDeviceLoginRequest({
      participantId: ownerId,
      clientId: "synthetic-host",
      rawUserCode: lapsed.userCode,
      authorization,
    });
    await database
      .update(deviceLoginRequests)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(deviceLoginRequests.id, lapsedRow.id));
    assert.equal((await readDeviceLoginStatus(lapsed.deviceCode)).status, "expired");
    await assert.rejects(
      redeemDeviceLogin(lapsed.deviceCode),
      DeviceLoginError,
      "an unconfirmed approval cannot be claimed after its window",
    );

    console.log(
      "Device login verified: server-derived context, read-only review, internal-lease refusal, single-use session, re-approval refusal, denial, split 180s/40s clocks, lapsed-approval refusal, and audit trail.",
    );
  } finally {
    for (const id of requestIds) {
      await database.delete(deviceLoginRequests).where(eq(deviceLoginRequests.id, id));
    }
    for (const participantId of participantIds) {
      const [row] = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);
      await database
        .delete(auditEvents)
        .where(eq(auditEvents.participantId, participantId));
      await database
        .delete(userSessions)
        .where(eq(userSessions.participantId, participantId));
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
