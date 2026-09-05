import { createHash, randomBytes } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  checkoutSessions,
  entitlements,
  usageLedger,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";

const DEFAULT_TRIAL_CREDITS = 500;
const CHECKOUT_TTL_MS = 30 * 60 * 1_000;

export const OPERATION_CREDITS = {
  browser_source: 15,
  browser_action: 15,
  sandbox_evaluation: 25,
  sandbox_task: 40,
  workspace_open: 100,
  workspace_resume: 25,
  workspace_checkpoint: 5,
  workspace_pause: 0,
} as const;

/**
 * What a participant can buy.
 *
 * One-off credit packs rather than a subscription: an agent's cost is the work
 * it does, and nobody should pay for a month in which they asked for nothing.
 */
export const PLANS = {
  starter: { name: "Sylla starter", credits: 2_000, priceInCents: 1_200 },
  regular: { name: "Sylla regular", credits: 10_000, priceInCents: 5_000 },
} as const;

export type PlanKey = keyof typeof PLANS;

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && value in PLANS;
}

export type BillableOperation = keyof typeof OPERATION_CREDITS;

export type BillingSummary = {
  planKey: string;
  status: "trialing" | "active" | "inactive" | "exhausted" | "canceled";
  creditLimit: number;
  creditsUsed: number;
  creditsReserved: number;
  creditsAvailable: number;
};

export type UsageReservation = {
  ledgerId: string;
  operation: BillableOperation;
  estimatedCredits: number;
  alreadyProcessed: boolean;
};

export class EntitlementRequiredError extends Error {
  constructor(
    readonly summary: BillingSummary,
    readonly checkoutUrl: string,
  ) {
    super("This operation needs additional Sylla work credits.");
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function trialCredits() {
  const configured = Number.parseInt(
    process.env.SYLLA_TRIAL_CREDITS ?? String(DEFAULT_TRIAL_CREDITS),
    10,
  );
  return Number.isSafeInteger(configured) && configured >= 0
    ? configured
    : DEFAULT_TRIAL_CREDITS;
}

function summary(row: typeof entitlements.$inferSelect): BillingSummary {
  const creditsAvailable = Math.max(
    0,
    row.creditLimit - row.creditsUsed - row.creditsReserved,
  );
  return {
    planKey: row.planKey,
    status:
      creditsAvailable === 0 &&
      (row.status === "trialing" || row.status === "active")
        ? "exhausted"
        : row.status,
    creditLimit: row.creditLimit,
    creditsUsed: row.creditsUsed,
    creditsReserved: row.creditsReserved,
    creditsAvailable,
  };
}

export async function getBillingSummary(
  participantId: string,
): Promise<BillingSummary> {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  await database
    .insert(entitlements)
    .values({
      userId: identity.userId,
      planKey: "starter-trial",
      status: "trialing",
      creditLimit: trialCredits(),
    })
    .onConflictDoNothing({ target: entitlements.userId });
  const [entitlement] = await database
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, identity.userId))
    .limit(1);

  if (!entitlement) throw new Error("Unable to initialize Sylla billing.");
  return summary(entitlement);
}

async function createCheckoutContinuation(userId: string) {
  const database = getDatabase();
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) throw new Error("APP_BASE_URL is required for checkout.");
  const token = randomBytes(32).toString("base64url");
  await database.insert(checkoutSessions).values({
    userId,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
  });
  return new URL(`/checkout/${token}`, appBaseUrl).toString();
}

export async function reserveBillableOperation(input: {
  participantId: string;
  operation: BillableOperation;
  idempotencyKey: string;
}): Promise<UsageReservation> {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(input.participantId);
  await getBillingSummary(input.participantId);
  const estimate = OPERATION_CREDITS[input.operation];
  const [placeholder] = await database
    .insert(usageLedger)
    .values({
      userId: identity.userId,
      agentId: identity.agentId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      estimatedCredits: estimate,
      status: "declined",
    })
    .onConflictDoNothing({ target: usageLedger.idempotencyKey })
    .returning();

  if (!placeholder) {
    const [existing] = await database
      .select()
      .from(usageLedger)
      .where(eq(usageLedger.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (
      !existing ||
      existing.userId !== identity.userId ||
      existing.agentId !== identity.agentId ||
      existing.operation !== input.operation
    ) {
      throw new Error("The idempotency key belongs to another operation.");
    }

    if (existing.status === "reserved" || existing.status === "settled") {
      return {
        ledgerId: existing.id,
        operation: input.operation,
        estimatedCredits: existing.estimatedCredits,
        alreadyProcessed: true,
      };
    }
  } else {
    const reserved = await database.execute<{ ledger_id: string }>(sql`
      with available_credit as (
        update entitlements
        set credits_reserved = credits_reserved + ${estimate},
            updated_at = now()
        where user_id = ${identity.userId}
          and status in ('trialing', 'active')
          and credits_used + credits_reserved + ${estimate} <= credit_limit
        returning user_id
      )
      update usage_ledger
      set status = 'reserved'
      from available_credit
      where usage_ledger.id = ${placeholder.id}
      returning usage_ledger.id as ledger_id
    `);

    if (reserved.rows[0]) {
      return {
        ledgerId: placeholder.id,
        operation: input.operation,
        estimatedCredits: estimate,
        alreadyProcessed: false,
      };
    }
  }

  const current = await getBillingSummary(input.participantId);
  const checkoutUrl = await createCheckoutContinuation(identity.userId);
  throw new EntitlementRequiredError(current, checkoutUrl);
}

export async function settleBillableOperation(
  reservation: UsageReservation,
  providerReference?: string,
  actualCredits = reservation.estimatedCredits,
) {
  const database = getDatabase();
  const chargedCredits = Math.max(
    0,
    Math.min(reservation.estimatedCredits, Math.round(actualCredits)),
  );
  await database.execute(sql`
    with settled_usage as (
      update usage_ledger
      set actual_credits = ${chargedCredits},
          status = 'settled',
          provider_reference = ${providerReference ?? null},
          settled_at = now()
      where id = ${reservation.ledgerId}
        and status = 'reserved'
      returning user_id, estimated_credits
    )
    update entitlements
    set credits_reserved = greatest(0, credits_reserved - settled_usage.estimated_credits),
        credits_used = credits_used + ${chargedCredits},
        updated_at = now()
    from settled_usage
    where entitlements.user_id = settled_usage.user_id
  `);
}

export async function releaseBillableOperation(
  reservation: UsageReservation,
) {
  const database = getDatabase();
  await database.execute(sql`
    with released_usage as (
      update usage_ledger
      set status = 'released', settled_at = now()
      where id = ${reservation.ledgerId}
        and status = 'reserved'
      returning user_id, estimated_credits
    )
    update entitlements
    set credits_reserved = greatest(0, credits_reserved - released_usage.estimated_credits),
        updated_at = now()
    from released_usage
    where entitlements.user_id = released_usage.user_id
  `);
}

export async function getCheckoutSession(token: string) {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return null;
  const database = getDatabase();
  const [checkout] = await database
    .select({
      planKey: checkoutSessions.planKey,
      status: checkoutSessions.status,
      expiresAt: checkoutSessions.expiresAt,
    })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.tokenHash, tokenHash(token)))
    .limit(1);

  if (!checkout || checkout.expiresAt <= new Date()) return null;
  return checkout;
}
