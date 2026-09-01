import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  and,
  eq,
  gt,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { getDatabase } from "@/db";
import { runtimeLeases } from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";

const DEFAULT_LEASE_SECONDS = 90;
const MIN_LEASE_SECONDS = 30;
const MAX_LEASE_SECONDS = 300;

export type RuntimeLeaseAuthorization = {
  clientId: string;
  runId: string;
  leaseToken: string;
};

export type AcquiredRuntimeLease = RuntimeLeaseAuthorization & {
  leaseId: string;
  purpose: string;
  expiresAt: string;
};

export class RuntimeLeaseConflictError extends Error {
  constructor(readonly availableAt: string) {
    super(`The agent is already active in another run until ${availableAt}.`);
  }
}

export class RuntimeLeaseAuthorizationError extends Error {}

function hashLeaseToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function leaseDuration(seconds?: number) {
  return Math.min(
    MAX_LEASE_SECONDS,
    Math.max(MIN_LEASE_SECONDS, seconds ?? DEFAULT_LEASE_SECONDS),
  );
}

export async function acquireRuntimeLease(input: {
  participantId: string;
  clientId: string;
  runId: string;
  purpose: string;
  durationSeconds?: number;
  allowTakeover?: boolean;
}): Promise<AcquiredRuntimeLease> {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(input.participantId);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + leaseDuration(input.durationSeconds) * 1_000,
  );
  const leaseToken = randomBytes(32).toString("base64url");
  const [lease] = await database
    .insert(runtimeLeases)
    .values({
      agentId: identity.agentId,
      participantId: input.participantId,
      ownerClientId: input.clientId,
      ownerRunId: input.runId,
      leaseTokenHash: hashLeaseToken(leaseToken),
      purpose: input.purpose,
      acquiredAt: now,
      heartbeatAt: now,
      expiresAt,
      releasedAt: null,
    })
    .onConflictDoUpdate({
      target: runtimeLeases.agentId,
      set: {
        participantId: input.participantId,
        ownerClientId: input.clientId,
        ownerRunId: input.runId,
        leaseTokenHash: hashLeaseToken(leaseToken),
        purpose: input.purpose,
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt,
        releasedAt: null,
      },
      setWhere: or(
        sql`${input.allowTakeover ?? false}`,
        lte(runtimeLeases.expiresAt, now),
        isNotNull(runtimeLeases.releasedAt),
        and(
          eq(runtimeLeases.ownerClientId, input.clientId),
          eq(runtimeLeases.ownerRunId, input.runId),
        ),
      ),
    })
    .returning();

  if (!lease) {
    const [active] = await database
      .select({ expiresAt: runtimeLeases.expiresAt })
      .from(runtimeLeases)
      .where(eq(runtimeLeases.agentId, identity.agentId))
      .limit(1);
    throw new RuntimeLeaseConflictError(
      active?.expiresAt.toISOString() ?? now.toISOString(),
    );
  }

  return {
    leaseId: lease.id,
    clientId: input.clientId,
    runId: input.runId,
    leaseToken,
    purpose: lease.purpose,
    expiresAt: lease.expiresAt.toISOString(),
  };
}

export async function requireRuntimeLease(
  participantId: string,
  authorization: RuntimeLeaseAuthorization,
) {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const [lease] = await database
    .select()
    .from(runtimeLeases)
    .where(
      and(
        eq(runtimeLeases.agentId, identity.agentId),
        eq(runtimeLeases.participantId, participantId),
        eq(runtimeLeases.ownerClientId, authorization.clientId),
        eq(runtimeLeases.ownerRunId, authorization.runId),
        eq(runtimeLeases.leaseTokenHash, hashLeaseToken(authorization.leaseToken)),
        isNull(runtimeLeases.releasedAt),
        gt(runtimeLeases.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!lease) {
    throw new RuntimeLeaseAuthorizationError(
      "The runtime lease is missing, expired, released, or owned by another run.",
    );
  }

  return lease;
}

export async function heartbeatRuntimeLease(
  participantId: string,
  authorization: RuntimeLeaseAuthorization,
  durationSeconds?: number,
) {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + leaseDuration(durationSeconds) * 1_000,
  );
  const [lease] = await database
    .update(runtimeLeases)
    .set({ heartbeatAt: now, expiresAt })
    .where(
      and(
        eq(runtimeLeases.agentId, identity.agentId),
        eq(runtimeLeases.participantId, participantId),
        eq(runtimeLeases.ownerClientId, authorization.clientId),
        eq(runtimeLeases.ownerRunId, authorization.runId),
        eq(runtimeLeases.leaseTokenHash, hashLeaseToken(authorization.leaseToken)),
        isNull(runtimeLeases.releasedAt),
        gt(runtimeLeases.expiresAt, now),
      ),
    )
    .returning();

  if (!lease) {
    throw new RuntimeLeaseAuthorizationError(
      "The runtime lease cannot be renewed because it is no longer active.",
    );
  }

  return { leaseId: lease.id, expiresAt: lease.expiresAt.toISOString() };
}

export async function releaseRuntimeLease(
  participantId: string,
  authorization: RuntimeLeaseAuthorization,
) {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const [lease] = await database
    .update(runtimeLeases)
    .set({ releasedAt: new Date() })
    .where(
      and(
        eq(runtimeLeases.agentId, identity.agentId),
        eq(runtimeLeases.participantId, participantId),
        eq(runtimeLeases.ownerClientId, authorization.clientId),
        eq(runtimeLeases.ownerRunId, authorization.runId),
        eq(runtimeLeases.leaseTokenHash, hashLeaseToken(authorization.leaseToken)),
      ),
    )
    .returning({ id: runtimeLeases.id });

  if (!lease) {
    throw new RuntimeLeaseAuthorizationError(
      "The runtime lease does not belong to this run.",
    );
  }
}

export async function withEphemeralRuntimeLease<T>(
  participantId: string,
  purpose: string,
  operation: (authorization: RuntimeLeaseAuthorization) => Promise<T>,
  options: { allowTakeover?: boolean } = {},
) {
  const lease = await acquireRuntimeLease({
    participantId,
    clientId: "sylla-web",
    runId: randomUUID(),
    purpose,
    allowTakeover: options.allowTakeover,
  });

  try {
    return await operation(lease);
  } finally {
    await releaseRuntimeLease(participantId, lease).catch(() => undefined);
  }
}
