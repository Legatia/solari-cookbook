"use client";

import {
  AlertCircle,
  Building2,
  Clock,
  LoaderCircle,
  Moon,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Stage = "new" | "talking" | "diligence" | "committed" | "passed";

type NeedsYou = {
  reason: "overdue" | "gone_quiet" | "never_contacted";
  says: string;
} | null;

type Summary = {
  id: string;
  kind: "person" | "organization";
  name: string;
  stage: Stage;
  relationship: string | null;
  nextAction: string | null;
  lastContactAt: string | null;
  known: number;
  pending: number;
  daysSinceContact: number | null;
  needsYou: NeedsYou;
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

type Pipeline = {
  needsYou: Summary[];
  byStage: Array<{ stage: Stage; subjects: Summary[] }>;
  total: number;
  open: number;
};

/** Their words, not the schema's. */
const STAGE_LABEL: Record<Stage, string> = {
  new: "Not yet approached",
  talking: "Talking",
  diligence: "In diligence",
  committed: "Committed",
  passed: "Passed",
};

const STAGE_ORDER: Stage[] = ["new", "talking", "diligence", "committed", "passed"];

const REASON_ICON = {
  overdue: AlertCircle,
  gone_quiet: Moon,
  never_contacted: Clock,
};

const PROVENANCE: Record<string, { label: string; tone: string }> = {
  told_to_me: { label: "You told me", tone: "text-lime-200/70" },
  observed: { label: "Read from a source", tone: "text-stone-400" },
  inferred: { label: "Worked out", tone: "text-amber-200/70" },
};

function when(value: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function DossierBoard() {
  const [board, setBoard] = useState<Pipeline | null>(null);
  const [open, setOpen] = useState<Dossier | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"person" | "organization">("person");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadBoard() {
    const response = await fetch("/api/subjects");
    const payload = (await response.json()) as { pipeline?: Pipeline; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not load the pipeline.");
    setBoard(payload.pipeline ?? null);
  }

  async function openDossier(id: string) {
    const response = await fetch(`/api/subjects/${id}`);
    const payload = (await response.json()) as { dossier?: Dossier; error?: string };
    if (!response.ok || !payload.dossier) {
      throw new Error(payload.error ?? "Could not open that record.");
    }
    setOpen(payload.dossier);
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadBoard();
      } catch {
        setBoard(null);
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

  function patch(id: string, body: Record<string, unknown>) {
    return run(async () => {
      const response = await fetch(`/api/subjects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { dossier?: Dossier; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not save that.");
      if (payload.dossier) setOpen(payload.dossier);
      await loadBoard();
    });
  }

  return (
    <div className="space-y-5">
      {/* What you have dropped, before anything else. */}
      <div className="rounded-[2rem] border border-white/[0.09] bg-[#101310] p-6 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-lime-200/60">
              Waiting on you
            </p>
            <h2 className="mt-2.5 font-heading text-3xl italic text-stone-100">
              {board === null
                ? "Reading your pipeline…"
                : board.needsYou.length === 0
                  ? "Nothing is slipping."
                  : `${board.needsYou.length} need${board.needsYou.length === 1 ? "s" : ""} you.`}
            </h2>
          </div>
          {board && (
            <p className="font-mono text-[11px] tabular-nums text-stone-600">
              {board.open} open · {board.total} tracked
            </p>
          )}
        </div>

        {board && board.needsYou.length > 0 && (
          <ul className="mt-5 space-y-1.5">
            {board.needsYou.map((subject) => {
              const Icon = REASON_ICON[subject.needsYou!.reason];
              const urgent = subject.needsYou!.reason === "overdue";
              return (
                <li key={subject.id}>
                  <button
                    type="button"
                    onClick={() => run(() => openDossier(subject.id))}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                      urgent
                        ? "border-amber-200/25 bg-amber-200/[0.05] hover:bg-amber-200/[0.08]"
                        : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.045]"
                    }`}
                  >
                    <Icon
                      className={`size-3.5 shrink-0 ${urgent ? "text-amber-200/80" : "text-stone-500"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-stone-100">
                        {subject.name}
                      </span>
                      <span className="block truncate text-[10px] text-stone-500">
                        {subject.needsYou!.says}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-stone-600">
                      {STAGE_LABEL[subject.stage]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {board && board.needsYou.length === 0 && board.total > 0 && (
          <p className="mt-4 text-xs leading-6 text-stone-600">
            Nothing is overdue and nothing has gone quiet. Your agent watches
            this between conversations.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-5">
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
                {option === "person" ? "Person" : "Firm"}
              </button>
            ))}
          </div>
          <input
            value={name}
            onChange={(changed) => setName(changed.target.value)}
            onKeyDown={(pressed) => {
              if (pressed.key === "Enter" && name.trim().length >= 2) {
                pressed.currentTarget.blur();
                run(async () => {
                  const response = await fetch("/api/subjects", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ name, kind }),
                  });
                  const payload = (await response.json()) as { opened?: string };
                  setName("");
                  await loadBoard();
                  if (payload.opened) await openDossier(payload.opened);
                });
              }
            }}
            placeholder={kind === "person" ? "Add a person" : "Add a firm"}
            className="min-w-[10rem] flex-1 rounded-full border border-white/[0.1] bg-black/25 px-4 py-2 text-xs text-stone-100 outline-none placeholder:text-stone-700 focus:border-lime-200/40"
          />
          <Button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={() =>
              run(async () => {
                const response = await fetch("/api/subjects", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ name, kind }),
                });
                const payload = (await response.json()) as {
                  opened?: string;
                  error?: string;
                };
                if (!response.ok) throw new Error(payload.error ?? "Could not add.");
                setName("");
                await loadBoard();
                if (payload.opened) await openDossier(payload.opened);
              })
            }
            className="rounded-full bg-lime-200 text-xs text-stone-950"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
            Track
          </Button>
        </div>
        {error && <p className="mt-3 text-xs leading-5 text-red-300/80">{error}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        {/* The pipeline, grouped by where things stand. */}
        <div className="rounded-[2rem] border border-white/[0.09] bg-white/[0.02] p-3">
          {board === null ? (
            <p className="p-4 text-xs text-stone-600">Loading…</p>
          ) : board.total === 0 ? (
            <p className="p-4 text-xs leading-6 text-stone-600">
              Nobody tracked yet. Your agent adds people here as you mention
              them — tell it who you met and what they said.
            </p>
          ) : (
            <div className="space-y-4">
              {board.byStage.map((group) => (
                <div key={group.stage}>
                  <p className="px-3 pb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600">
                    {STAGE_LABEL[group.stage]} · {group.subjects.length}
                  </p>
                  <ul>
                    {group.subjects.map((subject) => (
                      <li key={subject.id}>
                        <button
                          type="button"
                          onClick={() => run(() => openDossier(subject.id))}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            open?.id === subject.id
                              ? "bg-white/[0.06]"
                              : "hover:bg-white/[0.03]"
                          }`}
                        >
                          <span className="text-stone-600">
                            {subject.kind === "person" ? (
                              <User className="size-3" />
                            ) : (
                              <Building2 className="size-3" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs text-stone-200">
                            {subject.name}
                          </span>
                          {subject.needsYou && (
                            <span className="size-1.5 shrink-0 rounded-full bg-amber-200/70" />
                          )}
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-stone-600">
                            {subject.daysSinceContact === null
                              ? "—"
                              : `${subject.daysSinceContact}d`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* One record, with provenance on every line. */}
        <div className="rounded-[2rem] border border-white/[0.09] bg-[#101310] p-6 sm:p-7">
          {!open ? (
            <p className="text-xs leading-6 text-stone-600">
              Open a record to see everything you know and where each line came
              from.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-heading text-2xl italic text-stone-100">
                    {open.name}
                  </h3>
                  <p className="mt-1 text-[10px] text-stone-600">
                    {open.relationship ?? "No note on the relationship"} · last
                    spoke {when(open.lastContactAt)}
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
                      if (!response.ok) throw new Error("Could not remove it.");
                      setOpen(null);
                      await loadBoard();
                    })
                  }
                  className="shrink-0 rounded-full text-[11px] text-stone-600 hover:text-red-300"
                >
                  <Trash2 /> Remove
                </Button>
              </div>

              <div className="mt-5 flex flex-wrap gap-1">
                {STAGE_ORDER.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    disabled={busy}
                    onClick={() => patch(open.id, { stage })}
                    className={`rounded-full px-3 py-1.5 text-[10px] transition-colors ${
                      open.stage === stage
                        ? "bg-lime-200 text-stone-950"
                        : "border border-white/[0.1] text-stone-500 hover:text-stone-200"
                    }`}
                  >
                    {STAGE_LABEL[stage]}
                  </button>
                ))}
              </div>

              {open.needsYou && (
                <p className="mt-4 rounded-xl border border-amber-200/25 bg-amber-200/[0.05] px-4 py-2.5 text-[11px] text-amber-100/85">
                  {open.needsYou.says}
                </p>
              )}

              {open.nextAction && !open.needsYou && (
                <p className="mt-4 rounded-xl border border-lime-200/20 bg-lime-200/[0.04] px-4 py-2.5 text-[11px] text-lime-100/80">
                  Next: {open.nextAction}
                </p>
              )}

              <ul className="mt-6 border-t border-white/[0.07]">
                {open.claims.length === 0 && (
                  <li className="py-5 text-xs text-stone-600">
                    Nothing recorded yet.
                  </li>
                )}
                {open.claims.map((claim) => {
                  const provenance = PROVENANCE[claim.origin] ?? {
                    label: claim.origin,
                    tone: "text-stone-400",
                  };
                  return (
                    <li key={claim.id} className="border-b border-white/[0.05] py-3.5">
                      <p className="text-xs leading-6 text-stone-200">{claim.claim}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] text-stone-600">
                        <span className={provenance.tone}>{provenance.label}</span>
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
