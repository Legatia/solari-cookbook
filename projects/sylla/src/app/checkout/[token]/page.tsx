import { CheckoutOptions } from "@/components/checkout-options";
import { getCheckoutSession, PLANS, TIERS } from "@/lib/sylla/billing";
import { stripeIsConfigured } from "@/lib/sylla/stripe";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const checkout = await getCheckoutSession(token);
  const payments = stripeIsConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c0f0c] px-6 py-12 text-stone-100">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.22em] text-lime-200/70">
          Sylla hosted checkout
        </p>
        <h1 className="mt-4 font-heading text-4xl italic">
          {checkout ? "Work credits" : "This checkout link has expired"}
        </h1>
        {checkout ? (
          <>
            <p className="mt-5 text-sm leading-6 text-stone-400">
              Your agent, everything it remembers, your boundaries and the people
              here are free and stay that way. Credits pay for the machines
              Sylla runs on your behalf — research, workspaces, and work that
              continues after you close the chat.
            </p>
            <p className="mt-3 text-xs leading-5 text-stone-600">
              Payment happens on Stripe&apos;s own page. Card details never enter
              your conversation or an MCP tool call.
            </p>
            {payments ? (
              <CheckoutOptions
                token={token}
                tiers={Object.entries(TIERS).map(([key, tier]) => ({ key, ...tier }))}
                packs={Object.entries(PLANS).map(([key, pack]) => ({ key, ...pack }))}
              />
            ) : (
              <div className="mt-7 rounded-2xl border border-amber-200/15 bg-amber-100/[0.04] p-4 text-sm leading-6 text-amber-100/70">
                Payments are not configured on this deployment, so this
                continuation proves the boundary without being able to charge.
              </div>
            )}
          </>
        ) : (
          <p className="mt-5 text-sm leading-6 text-stone-400">
            Return to your agent and request a fresh checkout continuation.
          </p>
        )}
      </section>
    </main>
  );
}
