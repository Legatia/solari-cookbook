import { createHash, randomBytes, randomInt } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db";
import {
  authRateLimits,
  deviceLoginRequests,
  personalAgents,
  syllaUsers,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import {
  requireHumanHostLease,
  type RuntimeLeaseAuthorization,
} from "@/lib/sylla/leases";
import { recordAuditEvent } from "@/lib/sylla/participation";
import { createUserSession } from "@/lib/sylla/session";

export const DEVICE_CODE_COOKIE = "sylla_device_login";

/**
 * Two clocks, because the two states carry different risk.
 *
 * A pending code is inert: on its own it grants nothing, and it has to survive
 * a human alt-tabbing to a chat, an assistant round trip, and a spoken
 * confirmation. An *approved* request is a live session waiting to be claimed,
 * so it gets a much tighter window. `expiresAt` always means the deadline for
 * whichever state the request is currently in.
 */
const PENDING_TTL_SECONDS = 3 * 60;
const APPROVAL_TTL_SECONDS = 40;
export const DEVICE_LOGIN_POLL_INTERVAL_SECONDS = 3;

/** Crockford base32: no I, L, O, or U, so codes cannot be mistranscribed or spell words. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;

const GENERATE_LIMIT = 5;
const GENERATE_WINDOW_SECONDS = 10 * 60;
const APPROVE_LIMIT = 10;
const APPROVE_WINDOW_SECONDS = 10 * 60;
const POLL_LIMIT = 240;
const POLL_WINDOW_SECONDS = 10 * 60;
const MAX_APPROVAL_ATTEMPTS = 5;

export class DeviceLoginError extends Error {}
export class DeviceLoginRateLimitError extends DeviceLoginError {}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Human-facing form is `MIRA-K7QF`; storage and lookup always use the normalized form. */
export function formatUserCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeUserCode(raw: string) {
  const normalized = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    // Accept the characters Crockford drops so a human misreading still resolves.
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  if (normalized.length !== CODE_LENGTH) {
    throw new DeviceLoginError("That is not a valid Sylla login code.");
  }
  return normalized;
}

function generateUserCode() {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message: string,
) {
  const [row] = await getDatabase()
    .insert(authRateLimits)
    .values({ keyHash: hash(key) })
    .onConflictDoUpdate({
      target: authRateLimits.keyHash,
      set: {
        attempts: sql`case when ${authRateLimits.windowStartedAt} < now() - make_interval(secs => ${windowSeconds}) then 1 else ${authRateLimits.attempts} + 1 end`,
        windowStartedAt: sql`case when ${authRateLimits.windowStartedAt} < now() - make_interval(secs => ${windowSeconds}) then now() else ${authRateLimits.windowStartedAt} end`,
      },
    })
    .returning();
  if (row && row.attempts > limit) throw new DeviceLoginRateLimitError(message);
}

/**
 * Describe the browser asking to be signed in, using only what the server can
 * observe. A caller-supplied label would let an attacker forge a familiar
 * device name in someone else's approval prompt.
 */
export function describeRequestingDevice(request: NextRequest) {
  const userAgent = request.headers.get("user-agent")?.slice(0, 400) ?? "";
  const city = request.headers.get("x-vercel-ip-city");
  const country = request.headers.get("x-vercel-ip-country");
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  const platform =
    /iPhone|iPad|iOS/i.test(userAgent) ? "iOS"
    : /Android/i.test(userAgent) ? "Android"
    : /Macintosh|Mac OS X/i.test(userAgent) ? "macOS"
    : /Windows/i.test(userAgent) ? "Windows"
    : /Linux/i.test(userAgent) ? "Linux"
    : "an unrecognized device";
  const browser =
    /Edg\//i.test(userAgent) ? "Edge"
    : /OPR\/|Opera/i.test(userAgent) ? "Opera"
    : /Firefox\//i.test(userAgent) ? "Firefox"
    : /Chrome\//i.test(userAgent) ? "Chrome"
    : /Safari\//i.test(userAgent) ? "Safari"
    : "an unrecognized browser";

  const location = city
    ? `${decodeURIComponent(city)}${country ? `, ${country}` : ""}`
    : (country ?? null);

  return {
    deviceLabel: `${browser} on ${platform}`,
    requestUserAgent: userAgent || null,
    requestLocation: location,
    requestIpHash: forwarded ? hash(forwarded) : null,
    rateLimitKey: forwarded ?? userAgent ?? "anonymous",
  };
}

export type DeviceLoginContext = {
  userCode: string;
  deviceLabel: string;
  location: string | null;
  requestedAt: string;
  expiresAt: string;
  grants: string[];
};

/** What approval actually hands over. Stated once, here, and echoed verbatim to the approver. */
const GRANTS = [
  "Opens your Sylla control room in that browser",
  "Reads and manages your approved memories, evidence, and permissions",
  "Does not transfer agent ownership and does not create a new account",
  "Can be signed out at any time from Connected devices in the control room",
];

export async function createDeviceLoginRequest(request: NextRequest) {
  const device = describeRequestingDevice(request);
  await consumeRateLimit(
    `device-login:create:${device.rateLimitKey}`,
    GENERATE_LIMIT,
    GENERATE_WINDOW_SECONDS,
    "Too many sign-in codes were requested from this device. Wait a few minutes and try again.",
  );

  const deviceCode = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PENDING_TTL_SECONDS * 1_000);

  // Collisions are vanishingly unlikely but a duplicate user code would let one
  // approval resolve the wrong request, so retry rather than trusting odds.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userCode = generateUserCode();
    try {
      await getDatabase().insert(deviceLoginRequests).values({
        deviceCodeHash: hash(deviceCode),
        userCodeHash: hash(userCode),
        deviceLabel: device.deviceLabel,
        requestUserAgent: device.requestUserAgent,
        requestLocation: device.requestLocation,
        requestIpHash: device.requestIpHash,
        expiresAt,
      });
      return {
        userCode: formatUserCode(userCode),
        deviceCode,
        expiresAt: expiresAt.toISOString(),
        pollIntervalSeconds: DEVICE_LOGIN_POLL_INTERVAL_SECONDS,
      };
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new DeviceLoginError("Sylla could not issue a sign-in code. Try again.");
}

async function loadPendingByUserCode(userCode: string) {
  const [request] = await getDatabase()
    .select()
    .from(deviceLoginRequests)
    .where(eq(deviceLoginRequests.userCodeHash, hash(userCode)))
    .limit(1);

  if (!request || request.status !== "pending" || request.expiresAt <= new Date()) {
    throw new DeviceLoginError(
      "That sign-in code is not waiting for approval. It may have expired, been used, or been mistyped.",
    );
  }
  if (request.approvalAttempts >= MAX_APPROVAL_ATTEMPTS) {
    throw new DeviceLoginError("That sign-in request was locked after too many attempts.");
  }
  return request;
}

function toContext(request: {
  deviceLabel: string;
  requestLocation: string | null;
  createdAt: Date;
  expiresAt: Date;
}, userCode: string): DeviceLoginContext {
  return {
    userCode: formatUserCode(userCode),
    deviceLabel: request.deviceLabel,
    location: request.requestLocation,
    requestedAt: request.createdAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    grants: GRANTS,
  };
}

/**
 * Read-only. Approval is a separate call on purpose: a single approve(code)
 * tool is one injected instruction away from a silent grant, so the host must
 * show this context to the human and come back.
 */
export async function reviewDeviceLoginRequest(input: {
  participantId: string;
  rawUserCode: string;
}) {
  const userCode = normalizeUserCode(input.rawUserCode);
  await consumeRateLimit(
    `device-login:review:${input.participantId}`,
    APPROVE_LIMIT,
    APPROVE_WINDOW_SECONDS,
    "Too many sign-in codes were checked. Wait a few minutes and try again.",
  );
  const request = await loadPendingByUserCode(userCode);
  return toContext(request, userCode);
}

export async function approveDeviceLoginRequest(input: {
  participantId: string;
  clientId: string;
  rawUserCode: string;
  authorization: RuntimeLeaseAuthorization;
}) {
  // Signing a new browser into the control room is a consequential human
  // decision, so it needs the same human-held host lease as disclosure and
  // introduction acceptance. Background and fallback work cannot reach it.
  await requireHumanHostLease(input.participantId, input.authorization);
  const userCode = normalizeUserCode(input.rawUserCode);
  await consumeRateLimit(
    `device-login:approve:${input.participantId}`,
    APPROVE_LIMIT,
    APPROVE_WINDOW_SECONDS,
    "Too many sign-in approvals were attempted. Wait a few minutes and try again.",
  );

  const database = getDatabase();
  const identity = await ensurePortableIdentity(input.participantId);
  const pending = await loadPendingByUserCode(userCode);

  // Count the attempt before granting, so a guessing loop locks itself out.
  await database
    .update(deviceLoginRequests)
    .set({ approvalAttempts: sql`${deviceLoginRequests.approvalAttempts} + 1` })
    .where(eq(deviceLoginRequests.id, pending.id));

  const approvedAt = new Date();
  const [approved] = await database
    .update(deviceLoginRequests)
    .set({
      status: "approved",
      userId: identity.userId,
      approvedByParticipantId: input.participantId,
      approvedByClientId: input.clientId,
      approvedAt,
      // From here the browser has seconds, not minutes: an approved request is
      // one confirmation away from a signed-in control room.
      expiresAt: new Date(approvedAt.getTime() + APPROVAL_TTL_SECONDS * 1_000),
    })
    .where(
      and(
        eq(deviceLoginRequests.id, pending.id),
        eq(deviceLoginRequests.status, "pending"),
        isNull(deviceLoginRequests.userId),
      ),
    )
    .returning();

  if (!approved) {
    throw new DeviceLoginError("That sign-in code was already resolved.");
  }

  await recordAuditEvent({
    participantId: input.participantId,
    actorType: "participant",
    action: "device_login.approved",
    entityType: "device_login_request",
    entityId: approved.id,
    metadata: {
      deviceLabel: approved.deviceLabel,
      location: approved.requestLocation,
      approvedByClientId: input.clientId,
    },
  });

  return toContext(approved, userCode);
}

export async function denyDeviceLoginRequest(input: {
  participantId: string;
  rawUserCode: string;
  authorization: RuntimeLeaseAuthorization;
}) {
  await requireHumanHostLease(input.participantId, input.authorization);
  const userCode = normalizeUserCode(input.rawUserCode);
  const pending = await loadPendingByUserCode(userCode);

  await getDatabase()
    .update(deviceLoginRequests)
    .set({ status: "denied", deniedAt: new Date() })
    .where(
      and(
        eq(deviceLoginRequests.id, pending.id),
        eq(deviceLoginRequests.status, "pending"),
      ),
    );

  await recordAuditEvent({
    participantId: input.participantId,
    actorType: "participant",
    action: "device_login.denied",
    entityType: "device_login_request",
    entityId: pending.id,
    metadata: { deviceLabel: pending.deviceLabel, location: pending.requestLocation },
  });

  return { denied: true as const, userCode: formatUserCode(userCode) };
}

export type DeviceLoginStatus =
  | { status: "pending"; expiresAt: string; pollIntervalSeconds: number }
  | { status: "expired" | "denied" | "consumed" }
  | {
      status: "approved";
      agentName: string | null;
      accountName: string | null;
      expiresAt: string;
    };

/**
 * Polling never issues the session. It reports whose agent approved, so the
 * browser can show that before anything is signed in — otherwise an approval
 * from an attacker's account would silently drop the visitor into a stranger's
 * control room and invite them to type private things into it.
 */
export async function readDeviceLoginStatus(
  deviceCode: string,
): Promise<DeviceLoginStatus> {
  await consumeRateLimit(
    `device-login:poll:${deviceCode}`,
    POLL_LIMIT,
    POLL_WINDOW_SECONDS,
    "This sign-in request was polled too often.",
  );

  const database = getDatabase();
  const [request] = await database
    .update(deviceLoginRequests)
    .set({
      lastPolledAt: new Date(),
      pollCount: sql`${deviceLoginRequests.pollCount} + 1`,
    })
    .where(eq(deviceLoginRequests.deviceCodeHash, hash(deviceCode)))
    .returning();

  if (!request) throw new DeviceLoginError("This sign-in request is no longer available.");
  if (request.status === "denied") return { status: "denied" };
  if (request.status === "consumed") return { status: "consumed" };
  if (request.expiresAt <= new Date()) return { status: "expired" };
  if (request.status === "pending" || !request.userId) {
    return {
      status: "pending",
      expiresAt: request.expiresAt.toISOString(),
      pollIntervalSeconds: DEVICE_LOGIN_POLL_INTERVAL_SECONDS,
    };
  }

  const [[agent], [user]] = await Promise.all([
    database
      .select({ name: personalAgents.name })
      .from(personalAgents)
      .where(eq(personalAgents.ownerUserId, request.userId))
      .limit(1),
    database
      .select({ displayName: syllaUsers.displayName })
      .from(syllaUsers)
      .where(eq(syllaUsers.id, request.userId))
      .limit(1),
  ]);

  return {
    status: "approved",
    agentName: agent?.name ?? null,
    accountName: user?.displayName ?? null,
    expiresAt: request.expiresAt.toISOString(),
  };
}

/**
 * The final step, taken by the browser after the human confirms whose agent
 * this is. Marks the request consumed first so a replayed device code cannot
 * mint a second session.
 */
export async function redeemDeviceLogin(deviceCode: string) {
  const database = getDatabase();
  const [request] = await database
    .update(deviceLoginRequests)
    .set({ status: "consumed", consumedAt: new Date() })
    .where(
      and(
        eq(deviceLoginRequests.deviceCodeHash, hash(deviceCode)),
        eq(deviceLoginRequests.status, "approved"),
      ),
    )
    .returning();

  if (!request?.userId) {
    throw new DeviceLoginError("This sign-in request is no longer approved.");
  }
  if (request.expiresAt <= new Date()) {
    throw new DeviceLoginError("This sign-in request expired before it was completed.");
  }

  const session = await createUserSession(request.userId);
  await recordAuditEvent({
    participantId: session.participant.id,
    actorType: "participant",
    action: "device_login.completed",
    entityType: "device_login_request",
    entityId: request.id,
    metadata: { deviceLabel: request.deviceLabel, location: request.requestLocation },
  });
  return session;
}

export function attachDeviceCodeCookie<T extends NextResponse>(
  response: T,
  deviceCode: string,
) {
  response.cookies.set(DEVICE_CODE_COOKIE, deviceCode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    // Must outlive both clocks, or the browser loses the cookie it needs to
    // finish a sign-in it has already been approved for.
    maxAge: PENDING_TTL_SECONDS + APPROVAL_TTL_SECONDS,
    path: "/api/auth/device",
  });
  return response;
}

export function clearDeviceCodeCookie<T extends NextResponse>(response: T) {
  response.cookies.set(DEVICE_CODE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: new Date(0),
    path: "/api/auth/device",
  });
  return response;
}

export function readDeviceCodeCookie(request: NextRequest) {
  const value = request.cookies.get(DEVICE_CODE_COOKIE)?.value;
  if (!value || !/^[A-Za-z0-9_-]{32,}$/.test(value)) {
    throw new DeviceLoginError("This browser has no sign-in request in progress.");
  }
  return value;
}
