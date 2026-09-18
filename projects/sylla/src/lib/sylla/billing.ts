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
  // Waking a workspace whose machine was released. A real provision against an
  // existing volume and snapshot, so it costs most of an open — but not the
  // volume creation and first workbench build that an open also pays for.
  workspace_restore: 80,
  // The machine is still held and only needs waking, which is nearly free.
  workspace_resume: 25,
  workspace_checkpoint: 5,
  workspace_pause: 0,
} as const;

/**
 * The standing tiers.
 *
 * Split along Sylla's actual cost structure rather than by volume. The society
 * — the agent, its memory, boundaries, invitations, introductions — is rows in
 * Postgres and costs almost nothing per person, so it is free forever and is
 * never withheld for non-payment. Solari compute has a real unit cost, so that
 * is what a subscription buys.
 *
 * This is also the only pricing that fits the problem: a coordination network
 * is worth what its density is worth, and a paywall at the door is the most
 * effective way to prevent density.
 */
export const TIERS = {
  resident: {
    name: "Resident",
    priceInCents: 0,
    monthlyCredits: 0,
    blurb: "Your agent, your memory, your boundaries, and the people. Always free.",
  },
  working: {
    name: "Working",
    priceInCents: 1_200,
    monthlyCredits: 2_000,
    blurb: "Research, workspaces, and work that finishes after you close the chat.",
  },
  deep: {
    name: "Deep",
    priceInCents: 4_000,
    monthlyCredits: 10_000,
    blurb: "For an agent that is working most days.",
  },
} as const;

export type TierKey = keyof typeof TIERS;

export function isTierKey(value: unknown): value is TierKey {
  return typeof value === "string" && value in TIERS;
}

export function isPaidTier(value: unknown): value is Exclude<TierKey, "resident"> {
  return isTierKey(value) && value !== "resident";
}

/**
 * One-off credit packs, kept alongside the tiers.
 *
 * Someone with a burst of work should not have to take on a monthly
 * commitment, and a subscriber who runs dry mid-week should be able to top up
 * without changing tier.
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
  tierKey: TierKey;
  tierName: string;
  status: "trialing" | "active" | "inactive" | "exhausted" | "canceled";
  creditLimit: number;
  creditsUsed: number;
  creditsReserved: number;
  creditsAvailable: number;
  /** Always true. Stated explicitly so no surface has to infer it. */
  societyIncluded: true;
  monthlyCredits: number;
  renewsAt: string | null;
};

export type UsageReservation = {
  ledgerId: string;
  operation: BillableOperation;
  estimatedCredits: number;
  alreadyProcessed: boolean;
};

/**
 * Not enough credits for one piece of compute.
 *
 * Worded carefully, because this is the only moment money is ever mentioned to
 * someone using Sylla, and it must not read as an account being cut off. Only
 * the Solari machine is unavailable: the agent, its memory, the boundaries and
 * everyone the participant knows here are unaffected and always will be.
 */
export class EntitlementRequiredError extends Error {
  constructor(
    readonly summary: BillingSummary,
    readonly checkoutUrl: string,
  ) {
    super(
      "This particular job needs work credits. Everything else — your agent, what it remembers, your boundaries, and the people here — keeps working as it is.",
    );
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
  const tierKey = (isTierKey(row.tierKey) ? row.tierKey : "resident") as TierKey;
  return {
    planKey: row.planKey,
    tierKey,
    tierName: TIERS[tierKey].name,
    // "exhausted" describes the credit balance, never the account. Someone at
    // zero still has their agent, their memory, and everyone they know here.
    status:
      creditsAvailable === 0 &&
      (row.status === "trialing" || row.status === "active")
        ? "exhausted"
        : row.status,
    creditLimit: row.creditLimit,
    creditsUsed: row.creditsUsed,
    creditsReserved: row.creditsReserved,
    creditsAvailable,
    societyIncluded: true,
    monthlyCredits: TIERS[tierKey].monthlyCredits,
    renewsAt: row.periodEndsAt?.toISOString() ?? null,
  };
}

/**
 * Credit a paid period.
 *
 * Added to whatever is left rather than replacing it. Expiring the remainder
 * each month would recreate exactly the "I paid for a month I did not use"
 * resentment that packs were chosen to avoid, and it costs Sylla nothing to
 * carry it: an unspent credit is compute that was never bought.
 */
export async function grantSubscriptionPeriod(input: {
  userId: string;
  tierKey: TierKey;
  providerSubscriptionId?: string | null;
  periodEndsAt?: Date | null;
}) {
  const database = getDatabase();
  const credits = TIERS[input.tierKey].monthlyCredits;
  const [existing] = await database
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, input.userId))
    .limit(1);

  if (existing) {
    await database
      .update(entitlements)
      .set({
        status: "active",
        tierKey: input.tierKey,
        creditLimit: existing.creditLimit + credits,
        providerSubscriptionId:
          input.providerSubscriptionId ?? existing.providerSubscriptionId,
        periodStartedAt: new Date(),
        periodEndsAt: input.periodEndsAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(entitlements.id, existing.id));
  } else {
    await database.insert(entitlements).values({
      userId: input.userId,
      status: "active",
      tierKey: input.tierKey,
      planKey: input.tierKey,
      creditLimit: credits,
      providerSubscriptionId: input.providerSubscriptionId ?? null,
      periodEndsAt: input.periodEndsAt ?? null,
    });
  }
  return credits;
}

/** Link a subscription to its entitlement without granting anything. */
export async function attachSubscription(input: {
  userId: string;
  tierKey: TierKey;
  providerSubscriptionId: string;
}) {
  await getDatabase()
    .update(entitlements)
    .set({
      tierKey: input.tierKey,
      providerSubscriptionId: input.providerSubscriptionId,
      updatedAt: new Date(),
    })
    .where(eq(entitlements.userId, input.userId));
}

/**
 * A subscription ended.
 *
 * The tier drops to Resident and nothing else is taken away. Credits already
 * paid for stay: they were bought, not rented. The society was never
 * conditional on payment in the first place.
 */
export async function endSubscription(providerSubscriptionId: string) {
  const [ended] = await getDatabase()
    .update(entitlements)
    .set({
      tierKey: "resident",
      providerSubscriptionId: null,
      periodEndsAt: null,
      updatedAt: new Date(),
    })
    .where(eq(entitlements.providerSubscriptionId, providerSubscriptionId))
    .returning({ userId: entitlements.userId });
  return ended?.userId ?? null;
}

/** Find whose entitlement a renewal belongs to. */
export async function userForSubscription(providerSubscriptionId: string) {
  const [row] = await getDatabase()
    .select({ userId: entitlements.userId, tierKey: entitlements.tierKey })
    .from(entitlements)
    .where(eq(entitlements.providerSubscriptionId, providerSubscriptionId))
    .limit(1);
  return row ?? null;
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
