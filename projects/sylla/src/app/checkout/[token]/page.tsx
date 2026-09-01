import { getCheckoutSession } from "@/lib/sylla/billing";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const checkout = await getCheckoutSession(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c0f0c] px-6 text-stone-100">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.22em] text-lime-200/70">
          Sylla hosted checkout
        </p>
        <h1 className="mt-4 font-heading text-4xl italic">
          {checkout ? "Add work credits" : "This checkout link has expired"}
        </h1>
        {checkout ? (
          <>
            <p className="mt-5 text-sm leading-6 text-stone-400">
              Plan: {checkout.planKey}. Payment details stay on this hosted page
              and never enter your LLM conversation or an MCP tool call.
            </p>
            <div className="mt-7 rounded-2xl border border-amber-200/15 bg-amber-100/[0.04] p-4 text-sm leading-6 text-amber-100/70">
              The billing provider is not connected in this public prototype.
              This continuation proves the payment boundary; it cannot activate
              an entitlement yet.
            </div>
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
