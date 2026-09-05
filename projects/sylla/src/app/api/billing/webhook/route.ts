import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { applyWebhookEvent } from "@/lib/sylla/billing-events";
import { verifyWebhook, WebhookVerificationError } from "@/lib/sylla/stripe";

/**
 * Stripe's side of the payment.
 *
 * Entitlement is granted here rather than on the browser's return trip: a
 * redirect is a claim anyone can make, a signature is evidence. Reads the raw
 * body because signature verification is over the exact bytes Stripe signed.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  let event;
  try {
    event = verifyWebhook(raw, request.headers.get("stripe-signature"));
  } catch (error) {
    // 400 rather than 500: an unverifiable webhook is a rejected request, and
    // Stripe should not retry it forever.
    return NextResponse.json(
      {
        error:
          error instanceof WebhookVerificationError
            ? error.message
            : "The webhook could not be verified.",
      },
      { status: 400 },
    );
  }

  try {
    const outcome = await applyWebhookEvent(event);
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    // 500 so Stripe retries: the event was genuine, we just failed to apply it.
    console.error("stripe webhook failed to apply", event.id, error);
    return NextResponse.json({ error: "Could not apply this event." }, { status: 500 });
  }
}
