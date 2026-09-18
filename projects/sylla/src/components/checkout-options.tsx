"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Choice =
  | { kind: "tier"; key: string; name: string; priceInCents: number; monthlyCredits: number; blurb: string }
  | { kind: "pack"; key: string; name: string; priceInCents: number; credits: number };

function money(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function CheckoutOptions({
  token,
  tiers,
  packs,
}: {
  token: string;
  tiers: Array<{
    key: string;
    name: string;
    priceInCents: number;
    monthlyCredits: number;
    blurb: string;
  }>;
  packs: Array<{ key: string; name: string; priceInCents: number; credits: number }>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function start(choice: Choice) {
    setBusy(choice.key);
    setError(null);
    void (async () => {
      try {
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            choice.kind === "tier"
              ? { token, tierKey: choice.key }
              : { token, planKey: choice.key },
          ),
        });
        const payload = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !payload.url) {
          throw new Error(payload.error ?? "Could not start checkout.");
        }
        window.location.href = payload.url;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not start checkout.");
        setBusy(null);
      }
    })();
  }

  const paid = tiers.filter((tier) => tier.priceInCents > 0);
  const resident = tiers.find((tier) => tier.priceInCents === 0);

  return (
    <div className="mt-8 space-y-6">
      {resident && (
        <div className="rounded-2xl border border-lime-200/20 bg-lime-200/[0.04] p-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm text-stone-200">{resident.name}</p>
            <p className="text-xs text-lime-200/80">Already yours</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-stone-400">{resident.blurb}</p>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
          Monthly, for the work your agent does
        </p>
        {paid.map((tier) => (
          <div
            key={tier.key}
            className="rounded-2xl border border-white/[0.16] bg-black/20 p-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm text-stone-200">{tier.name}</p>
              <p className="text-sm text-stone-300">{money(tier.priceInCents)}/mo</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-400">{tier.blurb}</p>
            <p className="mt-1 text-[10px] text-stone-400">
              {tier.monthlyCredits.toLocaleString()} credits a month. Unused ones
              carry over.
            </p>
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => start({ kind: "tier", ...tier })}
              className="mt-4 w-full rounded-full bg-lime-200 text-xs text-stone-950"
            >
              {busy === tier.key && <LoaderCircle className="animate-spin" />}
              Choose {tier.name}
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-white/[0.14] pt-5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
          Or a one-off top-up, with no commitment
        </p>
        {packs.map((pack) => (
          <div key={pack.key} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-stone-300">{pack.name}</p>
              <p className="text-[10px] text-stone-400">
                {pack.credits.toLocaleString()} credits, once
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => start({ kind: "pack", ...pack })}
              className="shrink-0 rounded-full text-[11px] text-stone-400 hover:text-stone-100"
            >
              {busy === pack.key ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                money(pack.priceInCents)
              )}
            </Button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}
