import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isPlanKey, PLANS } from "@/lib/sylla/billing";
import { createHostedCheckout, stripeIsConfigured } from "@/lib/sylla/stripe";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

/** The plans on offer, so the page and the agent describe the same thing. */
export async function GET() {
  return NextResponse.json({
    plans: Object.entries(PLANS).map(([key, plan]) => ({ key, ...plan })),
    paymentsEnabled: stripeIsConfigured(),
  });
}

/** Start a hosted payment. Card details never come back through here. */
export async function POST(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const { token, planKey } = (await request.json()) as {
      token?: unknown;
      planKey?: unknown;
    };
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,}$/.test(token)) {
      throw new Error("That checkout link is not valid.");
    }
    if (!isPlanKey(planKey)) throw new Error("Choose a plan.");

    const identity = await ensurePortableIdentity(participant.id);
    const checkout = await createHostedCheckout({
      checkoutToken: token,
      planKey,
      userId: identity.userId,
    });
    return jsonWithSession(
      { url: checkout.url, acceptsPaymentDataInMcp: false },
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
