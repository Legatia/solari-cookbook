import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isPaidTier, isPlanKey, PLANS, TIERS } from "@/lib/sylla/billing";
import {
  createHostedCheckout,
  createSubscriptionCheckout,
  stripeIsConfigured,
} from "@/lib/sylla/stripe";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

/** The plans on offer, so the page and the agent describe the same thing. */
export async function GET() {
  return NextResponse.json({
    tiers: Object.entries(TIERS).map(([key, tier]) => ({ key, ...tier })),
    packs: Object.entries(PLANS).map(([key, plan]) => ({ key, ...plan })),
    // Restated here so no client has to infer it from a price of zero.
    societyIsFree: true,
    paymentsEnabled: stripeIsConfigured(),
  });
}

/** Start a hosted payment. Card details never come back through here. */
export async function POST(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const { token, planKey, tierKey } = (await request.json()) as {
      token?: unknown;
      planKey?: unknown;
      tierKey?: unknown;
    };
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,}$/.test(token)) {
      throw new Error("That checkout link is not valid.");
    }

    const identity = await ensurePortableIdentity(participant.id);

    // A tier is a monthly commitment; a pack is a one-off. Both end on a hosted
    // Stripe page, so neither brings card data back through here.
    if (tierKey !== undefined) {
      if (!isPaidTier(tierKey)) {
        throw new Error(
          "Resident is already yours and costs nothing — choose a paid tier or a credit pack.",
        );
      }
      const subscription = await createSubscriptionCheckout({
        checkoutToken: token,
        tierKey,
        userId: identity.userId,
      });
      return jsonWithSession(
        { url: subscription.url, recurring: true, acceptsPaymentDataInMcp: false },
        newToken,
      );
    }

    if (!isPlanKey(planKey)) throw new Error("Choose a plan.");
    const checkout = await createHostedCheckout({
      checkoutToken: token,
      planKey,
      userId: identity.userId,
    });
    return jsonWithSession(
      { url: checkout.url, recurring: false, acceptsPaymentDataInMcp: false },
      newToken,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not start a checkout.",
      },
      { status: 400 },
    );
  }
}
