"use client";

import { LoaderCircle, ShieldHalf } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type BoundaryKind = "paused" | "mutual_only" | "weekly_limit";

type Boundary = {
  kind: BoundaryKind;
  threshold: number | null;
  until: string | null;
  says: string;
};

type Shield = {
  boundaries: Boundary[];
  turnedAwayTotal: number;
  turnedAwayThisWeek: number;
  distinctPeople: number;
  byBoundary: Record<string, number>;
  mostRecentAt: string | null;
};

const OFFERED: Array<{ kind: BoundaryKind; label: string; blurb: string }> = [
  {
    kind: "paused",
    label: "Nothing right now",
    blurb: "Your agent turns everything away until you lift this.",
  },
  {
    kind: "mutual_only",
    label: "No cold approaches",
    blurb: "Only when both agents arrived at it independently.",
  },
  {
    kind: "weekly_limit",
    label: "At most three a week",
    blurb: "Anything past that waits rather than reaching you.",
  },
];

/**
 * The shield.
 *
 * Written to make one thing unmissable: the member can see what was refused on
 * their behalf, and can drop any of it in one press. A boundary they cannot
 * inspect would stop being protection.
 */
export function ShieldPanel() {
  const [shield, setShield] = useState<Shield | null>(null);
  const [busy, setBusy] = useState<BoundaryKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "GET" | "POST" | "DELETE", kind?: BoundaryKind) {
    const response = await fetch("/api/boundaries", {
      method,
      ...(kind
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind }),
          }
        : {}),
    });
    const payload = (await response.json()) as { shield?: Shield; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not change that.");
    setShield(payload.shield ?? null);
  }

  useEffect(() => {
    void (async () => {
      try {
        await send("GET");
      } catch {
        setShield(null);
      }
    })();
  }, []);

  function toggle(kind: BoundaryKind, on: boolean) {
    setBusy(kind);
    setError(null);
    void (async () => {
      try {
        await send(on ? "DELETE" : "POST", kind);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not change that.");
      } finally {
        setBusy(null);
      }
    })();
  }

  const inForce = new Set(shield?.boundaries.map((one) => one.kind) ?? []);

  return (
    <div className="rounded-[2rem] border border-white/[0.09] bg-white/[0.025] p-6 sm:p-8">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-lime-200/60">
            What reaches you
          </p>
          <h2 className="mt-3 font-heading text-3xl italic text-stone-100">
            Your agent can say no for you.
          </h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.05] text-lime-200">
          <ShieldHalf className="size-4" />
        </span>
      </div>

      <p className="mt-5 max-w-xl text-xs leading-6 text-stone-500">
        Set a boundary and your agent turns things away before you ever see
        them. Nobody is told you have a rule — they get the same answer as
        anyone Sylla could not introduce, and nothing is closed permanently, so
        a quiet week costs you nothing later.
      </p>

      <div className="mt-7 space-y-2">
        {OFFERED.map((option) => {
          const on = inForce.has(option.kind);
          return (
            <div
              key={option.kind}
              className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${
                on
                  ? "border-lime-200/25 bg-lime-200/[0.05]"
                  : "border-white/[0.08] bg-black/15"
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs text-stone-200">{option.label}</p>
                <p className="mt-1 text-[10px] leading-4 text-stone-600">
                  {shield?.boundaries.find((one) => one.kind === option.kind)?.says ??
                    option.blurb}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => toggle(option.kind, on)}
                className={`shrink-0 rounded-full text-[11px] ${
                  on ? "text-lime-200/80" : "text-stone-500 hover:text-stone-200"
                }`}
              >
                {busy === option.kind ? (
                  <LoaderCircle className="animate-spin" />
                ) : on ? (
                  "Lift this"
                ) : (
                  "Turn on"
                )}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 border-t border-white/[0.07] pt-5">
        <p className="text-[9px] uppercase tracking-[0.18em] text-stone-600">
          What it turned away
        </p>
        <p className="mt-3 text-xs leading-6 text-stone-400">
          {shield === null
            ? "Checking…"
            : shield.turnedAwayTotal === 0
              ? "Nothing so far. You will always be able to see this."
              : `${shield.turnedAwayTotal} turned away, from ${shield.distinctPeople} ${
                  shield.distinctPeople === 1 ? "person" : "people"
                }${
                  shield.turnedAwayThisWeek > 0
                    ? ` — ${shield.turnedAwayThisWeek} this week`
                    : ""
                }.`}
        </p>
        {shield !== null && shield.turnedAwayTotal > 0 && (
          <p className="mt-2 text-[10px] leading-5 text-stone-600">
            Who they were is deliberately not shown. You declined these without
            being asked, and naming them would hand you back the decision the
            boundary existed to spare you.
          </p>
        )}
      </div>
      {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}
