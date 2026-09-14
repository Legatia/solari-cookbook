"use client";

import { CircleCheck, Eye, Moon, Play, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

type Entry = {
  id: string;
  purpose: string;
  taskType: string;
  attendance: "with_you" | "while_you_were_away";
  status: string;
  startedAt: string;
  finishedAt: string | null;
  completedActions: string[];
  nextAction: string | null;
  creditsSpent: number;
  consequential: boolean;
  ranOn: string | null;
  degraded: boolean;
  evidenceProduced: number;
  replayAvailable: boolean;
};

type Log = {
  since: string;
  runs: number;
  unattendedRuns: number;
  creditsSpent: number;
  consequentialWhileAway: boolean;
  entries: Entry[];
};

function stamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The receipt for unattended work.
 *
 * Sylla asks people to let an agent work after they have closed the chat, so
 * the assurance is stated at the top rather than left to be read out of a short
 * list — "nothing happened" and "I cannot tell" look identical otherwise.
 */
export function WorkLog() {
  const [log, setLog] = useState<Log | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [replayNote, setReplayNote] = useState<Record<string, string>>({});

  /**
   * Fetch the link at the moment it is wanted.
   *
   * Opened in the same click rather than stored, because the provider issues a
   * presigned URL that would be dead by the time a list written days ago was
   * read.
   */
  function watch(runId: string) {
    setOpening(runId);
    setReplayNote((notes) => ({ ...notes, [runId]: "" }));
    void (async () => {
      try {
        const response = await fetch(`/api/worklog/replay?runId=${runId}`);
        const payload = (await response.json()) as {
          url?: string;
          message?: string;
          error?: string;
        };
        if (response.ok && payload.url) {
          window.open(payload.url, "_blank", "noopener,noreferrer");
          return;
        }
        setReplayNote((notes) => ({
          ...notes,
          [runId]: payload.message ?? payload.error ?? "That replay is not available.",
        }));
      } catch {
        setReplayNote((notes) => ({
          ...notes,
          [runId]: "Could not reach the recording.",
        }));
      } finally {
        setOpening(null);
      }
    })();
  }

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/worklog");
        const payload = (await response.json()) as { log?: Log; error?: string };
        if (!response.ok || !payload.log) {
          throw new Error(payload.error ?? "Could not read the log.");
        }
        setLog(payload.log);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not read the log.");
      }
    })();
  }, []);

  const clear = log !== null && !log.consequentialWhileAway;

  return (
    <div className="space-y-5">
      <div
        className={`rounded-[2rem] border p-6 sm:p-7 ${
          log === null
            ? "border-white/[0.09] bg-[#101310]"
            : clear
              ? "border-lime-200/20 bg-lime-200/[0.035]"
              : "border-amber-200/25 bg-amber-200/[0.05]"
        }`}
      >
        <div className="flex items-start gap-4">
          <span
            className={`mt-0.5 shrink-0 ${clear ? "text-lime-200/80" : "text-amber-200/80"}`}
          >
            {log === null ? null : clear ? (
              <CircleCheck className="size-5" />
            ) : (
              <TriangleAlert className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.18em] text-stone-500">
              Last 30 days
            </p>
            <h2 className="mt-2.5 font-heading text-3xl italic leading-tight text-stone-100">
              {log === null
                ? "Reading the log…"
                : clear
                  ? "Nothing irreversible happened while you were away."
                  : "Your agent took a consequential action alone."}
            </h2>
            {log && (
              <p className="mt-3 font-mono text-[11px] tabular-nums text-stone-500">
                {log.runs} run{log.runs === 1 ? "" : "s"} · {log.unattendedRuns}{" "}
                unattended · {log.creditsSpent} credits
              </p>
            )}
          </div>
        </div>
        {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
      </div>

      <div className="rounded-[2rem] border border-white/[0.09] bg-[#101310] p-2 sm:p-3">
        {log === null ? (
          <p className="p-5 text-xs text-stone-600">Loading…</p>
        ) : log.entries.length === 0 ? (
          <p className="p-5 text-xs leading-6 text-stone-600">
            Nothing yet. Work your agent does for you — research, workspaces,
            anything it finishes after you close the chat — is recorded here with
            what it cost.
          </p>
        ) : (
          <ul>
            {log.entries.map((entry) => {
              const away = entry.attendance === "while_you_were_away";
              return (
                <li
                  key={entry.id}
                  className="border-b border-white/[0.05] px-4 py-4 last:border-b-0"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 shrink-0 ${away ? "text-stone-400" : "text-stone-600"}`}
                      title={away ? "While you were away" : "With you"}
                    >
                      {away ? <Moon className="size-3.5" /> : <Eye className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-6 text-stone-200">
                        {entry.purpose}
                      </p>

                      {entry.completedActions.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {entry.completedActions.map((action) => (
                            <li
                              key={action}
                              className="border-l border-white/[0.1] pl-3 text-[11px] leading-5 text-stone-500"
                            >
                              {action}
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] text-stone-600">
                        <span className="tabular-nums">{stamp(entry.startedAt)}</span>
                        <span>·</span>
                        <span>{away ? "while you were away" : "with you"}</span>
                        <span>·</span>
                        <span>{entry.status.replace(/_/g, " ")}</span>
                        {entry.creditsSpent > 0 && (
                          <>
                            <span>·</span>
                            <span className="tabular-nums">
                              {entry.creditsSpent} credits
                            </span>
                          </>
                        )}
                        {entry.evidenceProduced > 0 && (
                          <>
                            <span>·</span>
                            <span className="tabular-nums">
                              {entry.evidenceProduced} for review
                            </span>
                          </>
                        )}
                        {entry.ranOn && (
                          <>
                            <span>·</span>
                            <span className="text-stone-500">ran on {entry.ranOn}</span>
                          </>
                        )}
                      </p>

                      {entry.replayAvailable && (
                        <button
                          type="button"
                          disabled={opening === entry.id}
                          onClick={() => watch(entry.id)}
                          className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-3 py-1.5 text-[10px] text-stone-300 transition-colors hover:border-lime-200/40 hover:text-lime-100 disabled:opacity-60"
                        >
                          <Play className="size-3" />
                          {opening === entry.id ? "Fetching…" : "Watch what it did"}
                        </button>
                      )}
                      {replayNote[entry.id] && (
                        <p className="mt-2 text-[10px] leading-5 text-stone-500">
                          {replayNote[entry.id]}
                        </p>
                      )}

                      {entry.consequential && (
                        <p className="mt-2 rounded-lg border border-amber-200/25 bg-amber-200/[0.05] px-3 py-2 text-[11px] leading-5 text-amber-100/85">
                          This run took an action that cannot be undone, without
                          you present.
                        </p>
                      )}
                      {entry.degraded && (
                        <p className="mt-2 text-[10px] leading-5 text-stone-600">
                          The model was unavailable, so this summary is
                          Sylla&apos;s own fallback rather than the agent&apos;s
                          account.
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
