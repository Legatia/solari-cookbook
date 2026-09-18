"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Start the demo over.
 *
 * Only rendered for an agent in the demo event, and refused by the server for
 * anyone else — so a member can never meet a one-press delete of everything
 * they have.
 */
export function DemoResetPanel() {
  const router = useRouter();
  const [isDemo, setIsDemo] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/demo/reset", { method: "GET" });
        const payload = (await response.json()) as { demo?: boolean };
        setIsDemo(Boolean(payload.demo));
      } catch {
        setIsDemo(false);
      }
    })();
  }, []);

  if (!isDemo) return null;

  return (
    <div className="rounded-[2rem] border border-white/[0.09] bg-white/[0.025] p-6 sm:p-8">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-lime-200/60">
            Demo agent
          </p>
          <h2 className="mt-3 font-heading text-3xl italic text-stone-100">
            Start over.
          </h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.05] text-lime-200">
          <RotateCcw className="size-4" />
        </span>
      </div>

      <p className="mt-5 max-w-xl text-xs leading-6 text-stone-500">
        This agent is a demo, so it can be erased and begun again. Everything
        goes — memory, dossiers, boundaries, the agent itself — and the next
        visit starts a genuinely first session. Real agents do not have this
        button.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {armed ? (
          <>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                void (async () => {
                  try {
                    const response = await fetch("/api/demo/reset", {
                      method: "POST",
                    });
                    const payload = (await response.json()) as { error?: string };
                    if (!response.ok) {
                      throw new Error(payload.error ?? "Could not reset.");
                    }
                    // Refresh as well as navigate: the session cookie is gone,
                    // so the shell has to be rebuilt from the fresh agent the
                    // next server render mints rather than from cached state.
                    router.push("/app");
                    router.refresh();
                  } catch (caught) {
                    setError(
                      caught instanceof Error ? caught.message : "Could not reset.",
                    );
                    setBusy(false);
                  }
                })();
              }}
              className="rounded-full bg-red-300/90 text-xs text-stone-950 hover:bg-red-300"
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
              Erase this agent
            </Button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="text-[11px] text-stone-500 hover:text-stone-200"
            >
              Keep it
            </button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setArmed(true)}
            className="rounded-full border border-white/[0.12] text-xs text-stone-400 hover:text-stone-100"
          >
            <RotateCcw /> Reset for the next demo
          </Button>
        )}
      </div>
      {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}
