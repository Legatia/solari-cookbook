"use client";

import { BookUser, Building2, LoaderCircle, Plus, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Summary = {
  id: string;
  kind: "person" | "organization";
  name: string;
  relationship: string | null;
  nextAction: string | null;
  lastContactAt: string | null;
  known: number;
  pending: number;
};

type Claim = {
  id: string;
  claim: string;
  origin: string;
  status: string;
  evidenceExcerpt: string | null;
  observedAt: string;
};

type Dossier = Summary & { claims: Claim[] };

/** How a claim was learned, in the participant's language rather than the schema's. */
const PROVENANCE: Record<string, { label: string; weight: string }> = {
  told_to_me: { label: "You told me", weight: "text-lime-200/70" },
  observed: { label: "Read from a source", weight: "text-stone-400" },
  inferred: { label: "Worked out", weight: "text-amber-200/70" },
};

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DossierBoard() {
  const [subjects, setSubjects] = useState<Summary[] | null>(null);
  const [open, setOpen] = useState<Dossier | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"person" | "organization">("person");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadList() {
    const response = await fetch("/api/subjects");
    const payload = (await response.json()) as { subjects?: Summary[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not load dossiers.");
    setSubjects(payload.subjects ?? []);
  }

  async function openDossier(id: string) {
    const response = await fetch(`/api/subjects/${id}`);
    const payload = (await response.json()) as { dossier?: Dossier; error?: string };
    if (!response.ok || !payload.dossier) {
      throw new Error(payload.error ?? "Could not open that dossier.");
    }
    setOpen(payload.dossier);
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadList();
      } catch {
        setSubjects([]);
      }
    })();
  }, []);

  function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await work();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/[0.09] bg-[#101310] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-lime-200/60">
              Your book on everyone else
            </p>
            <h2 className="mt-3 font-heading text-3xl italic text-stone-100">
              Dossiers.
            </h2>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.05] text-lime-200">
            <BookUser className="size-4" />
          </span>
        </div>
        <p className="mt-5 max-w-xl text-xs leading-6 text-stone-500">
          Everything else Sylla remembers is about you. These records are about
          other people, so they are held apart: private to you, never shared,
          never used for matching, never disclosed in an introduction.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-white/[0.1] p-0.5">
            {(["person", "organization"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-colors ${
                  kind === option
                    ? "bg-white/[0.07] text-stone-100"
                    : "text-stone-500 hover:text-stone-300"
                }`}
              >
                {option === "person" ? (
                  <User className="size-3" />
                ) : (
                  <Building2 className="size-3" />
                )}
                {option === "person" ? "Person" : "Organization"}
              </button>
            ))}
          </div>
          <input
            value={name}
            onChange={(changed) => setName(changed.target.value)}
            placeholder={kind === "person" ? "Who?" : "Which firm?"}
            className="min-w-[10rem] flex-1 rounded-full border border-white/[0.1] bg-black/25 px-4 py-2 text-xs text-stone-100 outline-none placeholder:text-stone-700 focus:border-lime-200/40"
          />
          <input
            value={note}
            onChange={(changed) => setNote(changed.target.value)}
            placeholder="What do you know? (optional)"
            className="min-w-[12rem] flex-[2] rounded-full border border-white/[0.1] bg-black/25 px-4 py-2 text-xs text-stone-100 outline-none placeholder:text-stone-700 focus:border-lime-200/40"
          />
          <Button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={() =>
              run(async () => {
                const response = await fetch("/api/subjects", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ name, kind, note }),
                });
                const payload = (await response.json()) as {
                  opened?: string;
                  error?: string;
                };
                if (!response.ok) throw new Error(payload.error ?? "Could not open it.");
                setName("");
                setNote("");
                await loadList();
                if (payload.opened) await openDossier(payload.opened);
              })
            }
            className="rounded-full bg-lime-200 text-xs text-stone-950"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
            Open a dossier
          </Button>
        </div>
        {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-white/[0.09] bg-white/[0.02] p-2">
          {subjects === null ? (
            <p className="p-5 text-xs text-stone-600">Loading…</p>
          ) : subjects.length === 0 ? (
            <p className="p-5 text-xs leading-6 text-stone-600">
              Nothing yet. Your agent can also add these while you talk — tell it
              something about a person or a firm and it will keep the record.
            </p>
          ) : (
            <ul>
              {subjects.map((subject) => (
                <li key={subject.id}>
                  <button
                    type="button"
                    onClick={() => run(() => openDossier(subject.id))}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                      open?.id === subject.id
                        ? "bg-white/[0.06]"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <span className="text-stone-600">
                      {subject.kind === "person" ? (
                        <User className="size-3.5" />
                      ) : (
                        <Building2 className="size-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-stone-200">
                        {subject.name}
                      </span>
                      <span className="block truncate text-[10px] text-stone-600">
                        {subject.relationship ?? "No relationship noted"}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-stone-600">
                      {subject.known}
                      {subject.pending > 0 && (
                        <span className="text-amber-200/70"> +{subject.pending}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[2rem] border border-white/[0.09] bg-[#101310] p-6 sm:p-7">
          {!open ? (
            <p className="text-xs leading-6 text-stone-600">
              Choose a dossier to see everything recorded and where each claim
              came from.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-heading text-2xl italic text-stone-100">
                    {open.name}
                  </h3>
                  <p className="mt-1 text-[10px] text-stone-600">
                    {open.relationship ?? "No relationship noted"} · last spoke{" "}
                    {when(open.lastContactAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const response = await fetch(`/api/subjects/${open.id}`, {
                        method: "DELETE",
                      });
                      if (!response.ok) throw new Error("Could not close it.");
                      setOpen(null);
                      await loadList();
                    })
                  }
                  className="shrink-0 rounded-full text-[11px] text-stone-600 hover:text-red-300"
                >
                  <Trash2 /> Close
                </Button>
              </div>

              {open.nextAction && (
                <p className="mt-4 rounded-xl border border-lime-200/20 bg-lime-200/[0.04] px-4 py-2.5 text-[11px] text-lime-100/80">
                  Next: {open.nextAction}
                </p>
              )}

              <ul className="mt-6 space-y-0 border-t border-white/[0.07]">
                {open.claims.length === 0 && (
                  <li className="py-5 text-xs text-stone-600">
                    Nothing recorded yet.
                  </li>
                )}
                {open.claims.map((claim) => {
                  const provenance = PROVENANCE[claim.origin] ?? {
                    label: claim.origin,
                    weight: "text-stone-400",
                  };
                  return (
                    <li
                      key={claim.id}
                      className="border-b border-white/[0.05] py-3.5"
                    >
                      <p className="text-xs leading-6 text-stone-200">
                        {claim.claim}
                      </p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] text-stone-600">
                        <span className={provenance.weight}>{provenance.label}</span>
                        <span>·</span>
                        <span className="tabular-nums">{when(claim.observedAt)}</span>
                        {claim.status === "pending" && (
                          <>
                            <span>·</span>
                            <span className="text-amber-200/70">awaiting you</span>
                          </>
                        )}
                      </p>
                      {claim.evidenceExcerpt && (
                        <p className="mt-2 border-l border-white/[0.1] pl-3 text-[11px] leading-5 text-stone-500">
                          {claim.evidenceExcerpt}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
