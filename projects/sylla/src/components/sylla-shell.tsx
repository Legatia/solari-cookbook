"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  Check,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileSearch,
  Globe2,
  LoaderCircle,
  Monitor,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  SyllaObservation,
  SyllaSessionState,
} from "@/lib/sylla/contracts";
import { cn } from "@/lib/utils";

type View = "conversation" | "connections" | "workspace" | "memory";
type SourceDraft = { url: string; label: string };
type ApiResponse = {
  state?: SyllaSessionState;
  error?: string;
  streamCapability?: string | null;
  checkout?: { url: string; hosted: true };
  connection?: {
    endpoint: string;
    connected: boolean;
    connectionCount: number;
    lastUsedAt: string | null;
  };
};

class SyllaApiError extends Error {
  constructor(
    message: string,
    readonly checkoutUrl?: string,
  ) {
    super(message);
  }
}

const navigation = [
  { id: "conversation" as const, label: "Conversation", icon: Sparkles },
  { id: "connections" as const, label: "Connect your AI", icon: Plug },
  { id: "workspace" as const, label: "Workspace", icon: Monitor },
  { id: "memory" as const, label: "Memory", icon: Brain },
];

const researchSteps = [
  "Opening an isolated Browser session",
  "Reading only the sources you approved",
  "Separating evidence from inference",
  "Preparing memories for your review",
];

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as ApiResponse;

  if (!response.ok) {
    throw new SyllaApiError(
      payload.error ?? "Sylla could not complete that request.",
      payload.checkout?.url,
    );
  }

  return payload;
}

function OriginBadge({ origin }: { origin: SyllaObservation["origin"] }) {
  const labels = {
    observed: "Observed",
    inferred: "Inferred",
    told_to_me: "Told to me",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-white/10 bg-white/[0.025] text-[9px] uppercase tracking-[0.12em]",
        origin === "inferred" ? "text-amber-200/75" : "text-stone-400",
      )}
    >
      {labels[origin]}
    </Badge>
  );
}

function AgentMark({ active = false }: { active?: boolean }) {
  return (
    <span className="agent-orbit relative grid size-12 shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.05]">
      <span
        className={cn(
          "size-2 rounded-full bg-lime-200 shadow-[0_0_22px_rgba(217,249,157,0.7)]",
          active && "animate-pulse",
        )}
      />
    </span>
  );
}

function LoadingScreen() {
  return (
    <main className="observatory-shell relative grid min-h-svh place-items-center overflow-hidden bg-background">
      <div className="text-center">
        <div className="flex justify-center"><AgentMark active /></div>
        <p className="mt-7 font-heading text-2xl italic text-stone-200">
          Opening your private room…
        </p>
      </div>
    </main>
  );
}

function ErrorScreen({ error, retry }: { error: string; retry: () => void }) {
  return (
    <main className="observatory-shell relative grid min-h-svh place-items-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="flex justify-center"><AgentMark /></div>
        <h1 className="mt-8 font-heading text-4xl italic text-stone-100">
          The room did not open.
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-500">{error}</p>
        <Button onClick={retry} className="mt-7 rounded-full bg-lime-200 text-stone-950">
          Try again <RefreshCw />
        </Button>
      </div>
    </main>
  );
}

function WithdrawnScreen({ eventName }: { eventName: string }) {
  return (
    <main className="observatory-shell relative grid min-h-svh place-items-center bg-background px-6">
      <div className="max-w-lg text-center">
        <div className="flex justify-center"><AgentMark /></div>
        <p className="mt-8 text-[10px] uppercase tracking-[0.22em] text-lime-200/60">
          Participation withdrawn
        </p>
        <h1 className="mt-4 font-heading text-5xl italic text-stone-100">
          You are out of the matching pool.
        </h1>
        <p className="mt-5 text-sm leading-7 text-stone-500">
          Sylla released active work, revoked event access, and will not use you
          for introductions at {eventName}. Your withdrawal remains auditable.
        </p>
      </div>
    </main>
  );
}

function ConsentScreen({
  state,
  onComplete,
  onConnect,
}: {
  state: SyllaSessionState;
  onComplete: (state: SyllaSessionState) => void;
  onConnect: () => void;
}) {
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 60 * 60 * 1_000);
  const defaultEnd = new Date(now.getTime() + 3 * 60 * 60 * 1_000);
  const localValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const [displayName, setDisplayName] = useState("");
  const [start, setStart] = useState(localValue(defaultStart));
  const [end, setEnd] = useState(localValue(defaultEnd));
  const [age, setAge] = useState(false);
  const [research, setResearch] = useState(false);
  const [memory, setMemory] = useState(false);
  const [matching, setMatching] = useState(false);
  const [hostBoundary, setHostBoundary] = useState(false);
  const [background, setBackground] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mandatoryAccepted = age && research && memory && hostBoundary;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mandatoryAccepted) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await api("/api/participation", {
        method: "POST",
        body: JSON.stringify({
          displayName,
          policyVersion: "2026-09-01",
          ageConfirmed: age,
          publicSourceResearch: research,
          privateMemoryStorage: memory,
          matchmaking: matching,
          hostDataBoundary: hostBoundary,
          backgroundContinuation: background,
          availability: matching
            ? [
                {
                  startsAt: new Date(start).toISOString(),
                  endsAt: new Date(end).toISOString(),
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
              ]
            : [],
        }),
      });
      if (payload.state) onComplete(payload.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Consent could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const choices = [
    [age, setAge, "I confirm that I am at least 18 years old."],
    [research, setResearch, "Sylla may visit only the public URLs I explicitly submit."],
    [memory, setMemory, "Sylla may store proposed private memories; none become approved until I decide."],
    [hostBoundary, setHostBoundary, "I understand my chosen LLM host may retain our conversation under its own terms."],
  ] as const;

  return (
    <main className="observatory-shell relative min-h-svh bg-background px-5 py-10 sm:px-8">
      <form onSubmit={submit} className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-16 lg:self-start">
          <p className="text-[10px] uppercase tracking-[0.22em] text-lime-200/65">Invitation · {state.event.name}</p>
          <h1 className="mt-5 font-heading text-[clamp(3.4rem,7vw,6.5rem)] leading-[0.88] tracking-[-0.05em] text-stone-100">
            Enter on your own terms.
          </h1>
          <p className="mt-7 max-w-sm text-sm leading-7 text-stone-500">
            Sylla is an agent you keep, not a social feed. It researches only what
            you approve, proposes memory for review, and never introduces you
            without a separate yes.
          </p>
          <button
            type="button"
            onClick={onConnect}
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-lime-200/20 bg-lime-200/[0.06] px-4 py-2.5 text-[10px] uppercase tracking-[0.16em] text-lime-200 transition-colors hover:bg-lime-200/[0.1]"
          >
            <Plug className="size-3.5" /> Connect your AI first
          </button>
          <p className="mt-3 max-w-xs text-[10px] leading-5 text-stone-600">
            Your AI can meet the agent now. Private actions unlock only after you choose the permissions here.
          </p>
        </div>
        <div className="space-y-8 rounded-[2rem] border border-white/[0.09] bg-black/15 p-6 sm:p-9">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500">How should people know you?</span>
            <Input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your display name" className="mt-3 border-white/10 bg-white/[0.025]" />
          </label>
          <fieldset>
            <legend className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Your explicit permissions</legend>
            <div className="mt-4 space-y-3">
              {choices.map(([checked, setChecked, label]) => (
                <label key={label} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs leading-5 text-stone-400">
                  <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 accent-lime-200" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <legend className="px-2 text-[10px] uppercase tracking-[0.18em] text-stone-500">Optional · private introductions</legend>
            <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-stone-400">
              <input type="checkbox" checked={matching} onChange={(event) => setMatching(event.target.checked)} className="mt-1 accent-lime-200" />
              <span>Let my agent look for people I may genuinely want to meet. Nothing identifying is shared unless both people separately say yes.</span>
            </label>
            {matching && (
              <div className="mt-5 grid gap-3 border-t border-white/[0.07] pt-5 sm:grid-cols-2">
                <label className="text-[10px] text-stone-500">Available from<Input required type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className="mt-2 border-white/10 bg-white/[0.025]" /></label>
                <label className="text-[10px] text-stone-500">Available until<Input required type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-2 border-white/10 bg-white/[0.025]" /></label>
              </div>
            )}
          </fieldset>
          <label className="flex items-start gap-3 border-t border-white/[0.07] pt-6 text-xs leading-5 text-stone-500">
            <input type="checkbox" checked={background} onChange={(event) => setBackground(event.target.checked)} className="mt-1 accent-lime-200" />
            <span><b className="font-medium text-stone-300">Optional:</b> let Sylla finish already-approved public-source research if my LLM disconnects. This never permits introductions or disclosures.</span>
          </label>
          {error && <p className="text-xs text-red-300/80">{error}</p>}
          <div className="flex items-center justify-between gap-5">
            <p className="max-w-xs text-[10px] leading-4 text-stone-600">Policy 2026-09-01 · You can withdraw and release active access at any time.</p>
            <Button type="submit" disabled={busy || !mandatoryAccepted || !displayName.trim()} className="rounded-full bg-lime-200 text-stone-950">
              {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />} Accept and continue
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}

function FirstSession({
  onComplete,
  onConnect,
}: {
  onComplete: (state: SyllaSessionState) => void;
  onConnect: () => void;
}) {
  const [agentName, setAgentName] = useState("");
  const [focus, setFocus] = useState("");
  const [sources, setSources] = useState<SourceDraft[]>([
    { url: "", label: "" },
  ]);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => setStep((current) => Math.min(current + 1, researchSteps.length - 1)),
      1450,
    );
    return () => window.clearInterval(timer);
  }, [running]);

  function updateSource(index: number, field: keyof SourceDraft, value: string) {
    setSources((current) =>
      current.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, [field]: value } : source,
      ),
    );
  }

  function loadDemo() {
    setAgentName("Mira");
    setFocus(
      "I care about building technology that creates lasting human relationships without becoming another addictive social feed.",
    );
    setSources([
      {
        url: "https://github.com/solari-sdk/solari-cookbook",
        label: "The tools I am building with",
      },
      { url: "https://www.getsolari.com", label: "Solari" },
    ]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const approved = sources.filter((source) => source.url.trim());

    if (!agentName.trim() || !focus.trim() || approved.length === 0) return;
    setRunning(true);
    setStep(0);
    setError(null);

    try {
      const payload = await api("/api/research", {
        method: "POST",
        body: JSON.stringify({ agentName, focus, sources: approved }),
      });
      if (payload.state) onComplete(payload.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Research failed.");
      setRunning(false);
    }
  }

  if (running) {
    return (
      <main className="observatory-shell relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-6">
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-5">
            <AgentMark active />
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-lime-200/70">
                {agentName} is looking
              </p>
              <h1 className="mt-2 font-heading text-4xl italic text-stone-100">
                Understanding begins with evidence.
              </h1>
            </div>
          </div>
          <div className="mt-12 space-y-1">
            {researchSteps.map((label, index) => (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-4 border-b border-white/[0.07] py-4 text-sm transition-colors",
                  index <= step ? "text-stone-300" : "text-stone-600",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full border text-[10px]",
                    index < step && "border-lime-200/20 bg-lime-200/[0.08] text-lime-200",
                    index === step && "border-lime-200/30 text-lime-200",
                    index > step && "border-white/10",
                  )}
                >
                  {index < step ? (
                    <Check className="size-3" />
                  ) : index === step ? (
                    <LoaderCircle className="size-3 animate-spin" />
                  ) : (
                    index + 1
                  )}
                </span>
                {label}
              </div>
            ))}
          </div>
          <p className="mt-7 text-xs leading-5 text-stone-500">
            Page content is treated as untrusted evidence. Nothing becomes memory
            until you approve it.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="observatory-shell relative min-h-svh overflow-hidden bg-background px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-full border border-lime-200/20">
              <span className="size-1.5 rounded-full bg-lime-200" />
            </span>
            <div>
              <p className="font-heading italic text-stone-100">Sylla</p>
              <p className="text-[8px] uppercase tracking-[0.2em] text-stone-500">
                First session
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onConnect}
              className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-lime-200/75 transition-colors hover:text-lime-200"
            >
              <Plug className="size-3.5" /> Connect your AI
            </button>
            <button
              type="button"
              onClick={loadDemo}
              className="text-[10px] uppercase tracking-[0.16em] text-stone-500 transition-colors hover:text-lime-200"
            >
              Load demo identity
            </button>
          </div>
        </header>

        <form
          onSubmit={submit}
          className="my-auto grid gap-12 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24"
        >
          <div className="lg:pt-8">
            <p className="text-[10px] uppercase tracking-[0.22em] text-lime-200/70">
              A room of your own
            </p>
            <h1 className="mt-5 max-w-md font-heading text-[clamp(3.2rem,7vw,6.7rem)] leading-[0.85] tracking-[-0.055em] text-stone-100">
              Let your agent begin to know you.
            </h1>
            <p className="mt-8 max-w-sm text-sm leading-7 text-stone-500">
              Name the agent you will keep. Give it one live question and a few
              public traces. You decide what becomes memory.
            </p>
          </div>

          <div className="space-y-8 rounded-[2rem] border border-white/[0.09] bg-black/15 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.2)] sm:p-9">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                What will you call your agent?
              </span>
              <Input
                value={agentName}
                onChange={(event) => setAgentName(event.target.value)}
                required
                maxLength={40}
                placeholder="A name only you need to understand"
                className="mt-3 h-12 rounded-none border-0 border-b border-white/10 bg-transparent px-0 font-heading text-xl italic text-stone-100 shadow-none focus-visible:border-lime-200/40 focus-visible:ring-0"
              />
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                What should it understand about you now?
              </span>
              <Textarea
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                required
                maxLength={280}
                rows={3}
                placeholder="A question, transition, ambition, or tension in your life…"
                className="mt-3 resize-none rounded-xl border-white/10 bg-white/[0.025] text-sm leading-6 text-stone-200 placeholder:text-stone-600 focus-visible:border-lime-200/30 focus-visible:ring-0"
              />
            </label>

            <fieldset>
              <legend className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                Approve 1–3 public sources
              </legend>
              <div className="mt-3 space-y-3">
                {sources.map((source, index) => (
                  <div key={index} className="group rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                    <div className="flex items-center gap-3">
                      <Globe2 className="size-4 shrink-0 text-stone-600" />
                      <Input
                        type="url"
                        value={source.url}
                        required={index === 0}
                        onChange={(event) => updateSource(index, "url", event.target.value)}
                        placeholder="https://your-public-source.com"
                        className="h-8 border-0 bg-transparent px-0 text-xs text-stone-300 shadow-none focus-visible:ring-0"
                      />
                      {sources.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSources((current) => current.filter((_, itemIndex) => itemIndex !== index))
                          }
                          aria-label={`Remove source ${index + 1}`}
                          className="text-stone-600 hover:text-stone-300"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <Input
                      value={source.label}
                      onChange={(event) => updateSource(index, "label", event.target.value)}
                      placeholder="Optional: why this source represents you"
                      className="mt-1 h-7 border-0 bg-transparent pl-7 text-[10px] text-stone-500 shadow-none focus-visible:ring-0"
                    />
                  </div>
                ))}
              </div>
              {sources.length < 3 && (
                <button
                  type="button"
                  onClick={() => setSources((current) => [...current, { url: "", label: "" }])}
                  className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-stone-500 hover:text-lime-200"
                >
                  <Plus className="size-3" /> Add another source
                </button>
              )}
            </fieldset>

            {error && <p className="text-xs leading-5 text-red-300/80">{error}</p>}

            <div className="flex flex-col-reverse gap-4 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xs text-[10px] leading-4 text-stone-600">
                Public URLs only. No accounts, private profiles, or physical desktop access.
              </p>
              <Button
                type="submit"
                className="h-11 rounded-full bg-lime-200 px-5 text-xs font-semibold text-stone-950 hover:bg-lime-100"
              >
                Begin the first session <ArrowRight />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

function ObservationCard({
  observation,
  onChange,
}: {
  observation: SyllaObservation;
  onChange: (next: SyllaSessionState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [claim, setClaim] = useState(observation.claim);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(method: "PATCH" | "DELETE", body?: object) {
    setBusy(true);
    setError(null);
    try {
      const payload = await api(`/api/observations/${observation.id}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (payload.state) onChange(payload.state);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Memory could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={cn(
        "group rounded-2xl border p-5 transition-colors sm:p-6",
        observation.status === "pending"
          ? "border-amber-200/15 bg-amber-50/[0.025]"
          : "border-white/[0.09] bg-white/[0.025]",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border",
            observation.status === "pending"
              ? "border-amber-200/20 text-amber-200/70"
              : "border-lime-200/20 bg-lime-200/[0.06] text-lime-200",
          )}
        >
          {observation.status === "pending" ? (
            <Sparkles className="size-3.5" />
          ) : (
            <Check className="size-3.5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <OriginBadge origin={observation.origin} />
            <Badge
              className={cn(
                "text-[9px] uppercase tracking-[0.1em]",
                observation.visibility === "private"
                  ? "bg-stone-200/[0.06] text-stone-500"
                  : "bg-lime-200/[0.08] text-lime-100",
              )}
            >
              {observation.visibility === "private" ? "Private" : "Shareable"}
            </Badge>
          </div>

          {editing ? (
            <div className="mt-4">
              <Textarea
                value={claim}
                onChange={(event) => setClaim(event.target.value)}
                className="min-h-24 border-white/10 bg-black/20 text-sm leading-6 text-stone-200 focus-visible:ring-0"
              />
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => mutate("PATCH", { claim, status: "edited" })}
                  className="rounded-full bg-lime-200 text-[10px] text-stone-950"
                >
                  Save correction
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setClaim(observation.claim);
                  }}
                  className="text-[10px] text-stone-500"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 max-w-2xl font-heading text-xl leading-7 text-stone-200">
              {observation.claim}
            </p>
          )}

          {observation.evidenceExcerpt && !editing && (
            <p className="mt-3 max-w-2xl border-l border-white/10 pl-4 text-xs leading-5 text-stone-500">
              {observation.evidenceExcerpt}
            </p>
          )}

          {observation.sourceUrl && !editing && (
            <a
              href={observation.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-[10px] text-stone-500 hover:text-lime-200"
            >
              {observation.sourceTitle ?? "Open evidence"} <ExternalLink className="size-3" />
            </a>
          )}

          {error && <p className="mt-3 text-xs text-red-300/80">{error}</p>}

          {!editing && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-4">
              {observation.status === "pending" && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => mutate("PATCH", { status: "confirmed" })}
                  className="h-8 rounded-full bg-lime-200 px-3 text-[10px] text-stone-950"
                >
                  <Check /> Keep
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setEditing(true)}
                className="h-8 text-[10px] text-stone-500 hover:text-stone-200"
              >
                <Pencil /> Correct
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  mutate("PATCH", {
                    visibility:
                      observation.visibility === "private" ? "shareable" : "private",
                  })
                }
                className="h-8 text-[10px] text-stone-500 hover:text-stone-200"
              >
                {observation.visibility === "private" ? <Eye /> : <EyeOff />}
                {observation.visibility === "private" ? "Make shareable" : "Make private"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => mutate("DELETE")}
                className="ml-auto h-8 text-[10px] text-stone-600 hover:text-red-300"
              >
                <Trash2 /> Forget
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ConversationView({
  state,
  onChange,
  openMemory,
  openWorkspace,
}: {
  state: SyllaSessionState;
  onChange: (state: SyllaSessionState) => void;
  openMemory: () => void;
  openWorkspace: () => void;
}) {
  const pending = state.observations.filter((item) => item.status === "pending").length;
  const approved = state.observations.length - pending;
  const [reflection, setReflection] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendReflection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reflection.trim()) return;
    setSending(true);
    setError(null);
    try {
      const payload = await api("/api/reflections", {
        method: "POST",
        body: JSON.stringify({ proposedMemory: reflection }),
      });
      if (payload.state) onChange(payload.state);
      setReflection("");
      openMemory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your reflection could not be saved.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center">
          <div className="flex items-center gap-4">
            <AgentMark />
            <div>
              <p className="font-heading text-xl italic text-stone-200">
                {pending ? "I found a few possible memories." : "I know enough to ask better questions."}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {state.agentName} · {state.research.provider === "solari" ? "researched with Solari Browser" : "safe mock research"}
              </p>
            </div>
          </div>

          <div className="mt-12 animate-rise">
            <h1 className="font-heading text-[clamp(2.6rem,5vw,5.2rem)] leading-[0.94] tracking-[-0.05em] text-stone-100">
              {pending
                ? "Before I remember you, tell me what I got right."
                : "What did I miss that would change who I should introduce you to?"}
            </h1>
            <p className="mt-7 max-w-xl text-sm leading-7 text-stone-500">
              {pending
                ? `${pending} proposal${pending === 1 ? " needs" : "s need"} your decision. Evidence stays beside every observation; inference is always labeled.`
                : `You have approved ${approved} ${approved === 1 ? "memory" : "memories"}. Add a private correction now, or open the workbench to inspect the complete picture.`}
            </p>

            <div className="mt-9 flex flex-wrap gap-2.5">
              {pending ? (
                <Button
                  onClick={openMemory}
                  className="h-10 rounded-full bg-lime-200 px-4 text-xs font-semibold text-stone-950"
                >
                  Review what I found <ArrowRight />
                </Button>
              ) : (
                <Button
                  onClick={openWorkspace}
                  className="h-10 rounded-full bg-lime-200 px-4 text-xs font-semibold text-stone-950"
                >
                  Open my workbench <ArrowUpRight />
                </Button>
              )}
              <Button
                variant="outline"
                onClick={openMemory}
                className="h-10 rounded-full border-white/10 bg-transparent px-4 text-xs text-stone-400"
              >
                Inspect memory
              </Button>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={sendReflection} className="border-t border-white/[0.07] p-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-2xl items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-2 pl-4 focus-within:border-lime-200/25">
          <label htmlFor="reflection" className="sr-only">
            Tell {state.agentName} what it missed
          </label>
          <textarea
            id="reflection"
            value={reflection}
            onChange={(event) => setReflection(event.target.value)}
            rows={1}
            maxLength={280}
            placeholder="Write one exact sentence to propose as memory…"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-stone-200 outline-none placeholder:text-stone-600"
          />
          <Button
            type="submit"
            size="icon-lg"
            disabled={sending || !reflection.trim()}
            aria-label="Send reflection"
            className="rounded-xl bg-stone-100 text-stone-950"
          >
            {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
          </Button>
        </div>
        <p className="mx-auto mt-2.5 max-w-2xl px-1 text-[10px] tracking-wide text-stone-600">
          Only this exact sentence is stored as a private proposal. Do not paste a raw debrief; it still waits for your approval.
        </p>
        {error && <p className="mx-auto mt-2 max-w-2xl px-1 text-xs text-red-300/80">{error}</p>}
      </form>
    </section>
  );
}

function MemoryView({
  state,
  onChange,
  openWorkspace,
}: {
  state: SyllaSessionState;
  onChange: (state: SyllaSessionState) => void;
  openWorkspace: () => void;
}) {
  const pending = state.observations.filter((item) => item.status === "pending");
  const kept = state.observations.filter((item) => item.status !== "pending");

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-3xl animate-rise">
        <div className="flex flex-col gap-5 border-b border-white/[0.08] pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-lime-200/60">
              {state.agentName}&apos;s memory ledger
            </p>
            <h1 className="mt-3 font-heading text-4xl italic tracking-tight text-stone-100 sm:text-5xl">
              What stays is your decision.
            </h1>
          </div>
          <div className="flex gap-5 text-xs text-stone-500">
            <span><b className="mr-1 font-heading text-xl text-stone-200">{kept.length}</b> kept</span>
            <span><b className="mr-1 font-heading text-xl text-amber-200/70">{pending.length}</b> pending</span>
          </div>
        </div>

        {pending.length > 0 && (
          <div className="mt-9">
            <p className="mb-3 text-[9px] uppercase tracking-[0.18em] text-amber-200/60">
              Needs your judgment
            </p>
            <div className="space-y-3">
              {pending.map((observation) => (
                <ObservationCard key={observation.id} observation={observation} onChange={onChange} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[9px] uppercase tracking-[0.18em] text-stone-500">Approved memory</p>
            {kept.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={openWorkspace}
                className="text-[10px] text-stone-500 hover:text-lime-200"
              >
                See in workbench <ArrowUpRight />
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {kept.length ? (
              kept.map((observation) => (
                <ObservationCard key={observation.id} observation={observation} onChange={onChange} />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-xs text-stone-600">
                Nothing is remembered until you keep it.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DesktopStream({ streamUrl }: { streamUrl: string }) {
  const target = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Connecting to the private Desktop…");

  useEffect(() => {
    if (!target.current) return;
    let disconnect: (() => void) | undefined;
    let cancelled = false;

    void import("@solarisdk/desktop").then(async ({ mountDesktop }) => {
      if (!target.current || cancelled) return;
      try {
        const viewer = await mountDesktop(target.current, {
          streamUrl,
          viewOnly: true,
          scaleViewport: true,
          background: "#101310",
          onConnect: () => setStatus("Live · view only"),
          onDisconnect: () => setStatus("Desktop stream ended"),
        });
        disconnect = viewer.disconnect;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Desktop viewer failed");
      }
    });

    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, [streamUrl]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101310]">
      <div className="flex h-9 items-center justify-between border-b border-white/[0.08] px-3">
        <div className="flex gap-1.5">
          <span className="size-1.5 rounded-full bg-red-300/40" />
          <span className="size-1.5 rounded-full bg-amber-300/40" />
          <span className="size-1.5 rounded-full bg-lime-300/40" />
        </div>
        <span className="text-[9px] text-lime-200/70">{status}</span>
      </div>
      <div ref={target} className="aspect-video w-full overflow-hidden" />
    </div>
  );
}

function WorkspaceBoard({ state, compact = false }: { state: SyllaSessionState; compact?: boolean }) {
  const approved = state.observations.filter((item) => item.status !== "pending");

  return (
    <div className={cn("paper-grid relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101310]", compact ? "aspect-[4/3] p-4" : "aspect-video p-5 sm:p-7")}>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <span className="size-1.5 rounded-full bg-red-300/40" />
          <span className="size-1.5 rounded-full bg-amber-300/40" />
          <span className="size-1.5 rounded-full bg-lime-300/40" />
        </div>
        {!compact && <span className="text-[8px] uppercase tracking-[0.16em] text-stone-600">Reconstructible preview</span>}
      </div>
      <div className={cn("grid h-[calc(100%-2rem)]", compact ? "mt-5 grid-cols-1" : "mt-7 grid-cols-[0.32fr_1fr] gap-5")}>
        {!compact && (
          <div className="border-r border-white/[0.07] pr-4">
            <p className="font-heading text-xl italic text-stone-200">{state.agentName}</p>
            <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-lime-200/50">Private workbench</p>
            <div className="mt-6 space-y-2 text-[9px] text-stone-600">
              <p>{state.sources.length} approved sources</p>
              <p>{approved.length} approved memories</p>
            </div>
          </div>
        )}
        <div className="min-w-0 space-y-2 overflow-hidden">
          {approved.slice(0, compact ? 2 : 3).map((observation, index) => (
            <div key={observation.id} className="rounded-lg border border-white/[0.07] bg-black/15 p-3">
              <p className="line-clamp-2 font-heading text-xs leading-4 text-stone-300">
                <span className="mr-2 text-stone-600">0{index + 1}</span>{observation.claim}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkspaceView({
  state,
  onChange,
  streamUrl,
  onStream,
}: {
  state: SyllaSessionState;
  onChange: (state: SyllaSessionState) => void;
  streamUrl: string | null;
  onStream: (url: string | null) => void;
}) {
  const approved = state.observations.filter((item) => item.status !== "pending");
  const [provisioning, setProvisioning] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  async function provision() {
    setProvisioning(true);
    setError(null);
    setCheckoutUrl(null);
    try {
      const payload = await api("/api/workspace", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (payload.state) onChange(payload.state);
      onStream(payload.streamCapability ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace failed.");
      setCheckoutUrl(
        caught instanceof SyllaApiError ? caught.checkoutUrl ?? null : null,
      );
    } finally {
      setProvisioning(false);
    }
  }

  async function pauseWorkspace() {
    setClosing(true);
    setError(null);
    try {
      const payload = await api("/api/workspace", { method: "PATCH" });
      if (payload.state) onChange(payload.state);
      onStream(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace could not be paused.");
    } finally {
      setClosing(false);
    }
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-5xl animate-rise">
        <div className="flex flex-col gap-6 border-b border-white/[0.08] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-lime-200/60">
              <span className="size-1.5 rounded-full bg-lime-200" />
              {state.workspace?.status === "ready" ? "Workspace synchronized" : "Ready to materialize"}
            </div>
            <h1 className="font-heading text-4xl italic tracking-tight text-stone-100 sm:text-5xl">
              What {state.agentName} understands.
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.workspace?.status === "ready" && (
              <Button
                variant="outline"
                onClick={pauseWorkspace}
                disabled={closing || provisioning}
                className="rounded-full border-white/10 bg-transparent px-4 text-xs text-stone-400"
              >
                {closing ? <LoaderCircle className="animate-spin" /> : <CirclePause />}
                Pause Desktop
              </Button>
            )}
            <Button
              onClick={provision}
              disabled={provisioning || closing || approved.length === 0}
              className="rounded-full bg-lime-200 px-4 text-xs text-stone-950"
            >
              {provisioning ? (
                <><LoaderCircle className="animate-spin" /> Building workbench…</>
              ) : state.workspace?.status === "ready" ? (
                <><RefreshCw /> Rebuild from memory</>
              ) : (
                <><Monitor /> Open Solari Desktop</>
              )}
            </Button>
          </div>
        </div>

        <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_0.36fr]">
          <div>
            {streamUrl ? <DesktopStream streamUrl={streamUrl} /> : <WorkspaceBoard state={state} />}
            {error && <p className="mt-3 text-xs text-red-300/80">{error}</p>}
            {checkoutUrl && (
              <a
                href={checkoutUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-xs text-lime-200 underline-offset-4 hover:underline"
              >
                Continue to Sylla checkout <ArrowUpRight className="size-3" />
              </a>
            )}
            <p className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-stone-600">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              This workbench is reconstructed from approved database records. It cannot see your physical computer, raw private chats, or forgotten memories.
            </p>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5">
              <p className="text-[9px] uppercase tracking-[0.16em] text-stone-500">Current question</p>
              <p className="mt-4 font-heading text-xl italic leading-6 text-stone-200">{state.focus}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5">
              <p className="text-[9px] uppercase tracking-[0.16em] text-stone-500">Approved material</p>
              <div className="mt-5 space-y-4">
                {state.sources.map((source) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 text-xs text-stone-500 hover:text-lime-200"
                  >
                    <FileSearch className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{source.title ?? source.label ?? source.url}</span>
                    <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function RuntimeRail({ state, openWorkspace }: { state: SyllaSessionState; openWorkspace: () => void }) {
  const approved = state.observations.filter((item) => item.status !== "pending").length;
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-white/[0.07] bg-black/10 p-5 xl:flex">
      <div className="flex items-center justify-between">
        <p className="text-[9px] uppercase tracking-[0.2em] text-stone-500">Agent computer</p>
        <span className="flex items-center gap-1.5 text-[9px] text-lime-200/70">
          <span className="size-1.5 rounded-full bg-lime-200" /> Inspectable
        </span>
      </div>
      <button type="button" onClick={openWorkspace} className="mt-4 w-full text-left">
        <WorkspaceBoard state={state} compact />
      </button>
      <div className="mt-7 space-y-5">
        {[
          [Globe2, "Browser", `${state.sources.length} approved sources read`],
          [Monitor, "Desktop", state.workspace?.status === "ready" ? "Workspace synchronized" : "Ready on demand"],
          [Brain, "Memory", `${approved} approved · ${state.observations.length - approved} pending`],
        ].map(([Icon, label, detail]) => {
          const RuntimeIcon = Icon as typeof Globe2;
          return (
            <div key={label as string} className="flex items-center gap-3">
              <span className="grid size-7 place-items-center rounded-full border border-white/10 text-stone-500">
                <RuntimeIcon className="size-3.5" />
              </span>
              <div>
                <p className="text-[11px] text-stone-300">{label as ReactNode}</p>
                <p className="mt-0.5 text-[9px] text-stone-600">{detail as ReactNode}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-auto border-t border-white/[0.07] pt-5 text-[10px] leading-4 text-stone-600">
        Nothing becomes memory without your approval. Forgotten items are removed from the durable ledger.
      </div>
    </aside>
  );
}

function ConnectionsView({ agentName }: { agentName: string | null }) {
  const [connection, setConnection] = useState<ApiResponse["connection"] | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const payload = await api("/api/mcp/connection");
      setConnection(payload.connection);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connection state failed.");
    }
  }

  useEffect(() => {
    let active = true;
    api("/api/mcp/connection")
      .then((payload) => {
        if (active) setConnection(payload.connection);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Connection state failed.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function copyEndpoint() {
    if (!connection?.endpoint) return;
    await navigator.clipboard.writeText(connection.endpoint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const payload = await api("/api/mcp/connection", { method: "DELETE" });
      setConnection(payload.connection);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-5xl animate-rise">
        <div className="grid gap-8 border-b border-white/[0.08] pb-9 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-lime-200/60">
              <span className="size-1.5 rounded-full bg-lime-200" /> MCP connection
            </div>
            <h1 className="max-w-3xl font-heading text-5xl leading-[0.92] tracking-[-0.045em] text-stone-100 sm:text-6xl">
              Bring {agentName ?? "your agent"} into the AI you already use.
            </h1>
          </div>
          <p className="text-sm leading-7 text-stone-500">
            The host model supplies active reasoning. Sylla supplies your approved memory, identity, permissions, introductions, and Solari tools.
          </p>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
          <div className="rounded-[2rem] border border-white/[0.09] bg-white/[0.025] p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] text-stone-600">Your Sylla MCP endpoint</p>
                <p className="mt-2 text-xs text-stone-400">OAuth 2.1 · PKCE · portable identity</p>
              </div>
              <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px]", connection?.connected ? "border-lime-200/20 bg-lime-200/[0.06] text-lime-200" : "border-white/10 text-stone-500")}>
                <span className={cn("size-1.5 rounded-full", connection?.connected ? "bg-lime-200" : "bg-stone-600")} />
                {connection?.connected ? `${connection.connectionCount} connected` : "Ready to connect"}
              </span>
            </div>

            <div className="mt-7 flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-3">
              <code className="min-w-0 flex-1 truncate text-xs text-stone-300">{connection?.endpoint ?? "Loading endpoint…"}</code>
              <Button type="button" variant="ghost" size="sm" onClick={() => void copyEndpoint()} disabled={!connection?.endpoint} className="shrink-0 text-stone-400 hover:text-lime-200">
                {copied ? <CheckCircle2 /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <ol className="mt-8 space-y-5">
              {[
                ["01", "Enable Developer mode", "In ChatGPT, open Settings → Security and login → Developer mode."],
                ["02", "Add an MCP connection", "Open ChatGPT Plugins, press +, and paste your Sylla MCP endpoint."],
                ["03", "Approve the relationship", `Sylla opens a private consent screen. Choose “Connect my agent” to give the host access to ${agentName ?? "your agent"}.`],
                ["04", "Talk normally", `Ask “What do you remember about me?”, “Remember this,” or “Use ${agentName ?? "my agent"} to research these sources.”`],
              ].map(([number, title, body]) => (
                <li key={number} className="grid grid-cols-[2.4rem_1fr] gap-4">
                  <span className="font-mono text-[9px] text-lime-200/50">{number}</span>
                  <div>
                    <p className="text-sm font-medium text-stone-200">{title}</p>
                    <p className="mt-1.5 text-xs leading-6 text-stone-500">{body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-wrap gap-3 border-t border-white/[0.07] pt-6">
              <a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-lime-200 px-5 text-xs font-semibold text-stone-950">
                Open ChatGPT Plugins <ArrowUpRight className="size-3.5" />
              </a>
              <Button type="button" variant="outline" onClick={() => void refresh()} className="rounded-full border-white/10 bg-transparent text-xs text-stone-400">
                <RefreshCw /> Refresh status
              </Button>
              {connection?.connected && (
                <Button type="button" variant="ghost" onClick={() => void disconnect()} disabled={busy} className="rounded-full text-xs text-red-300/60 hover:text-red-300">
                  <X /> Disconnect all
                </Button>
              )}
            </div>
            {connection?.lastUsedAt && <p className="mt-4 text-[9px] text-stone-600">Last used {new Date(connection.lastUsedAt).toLocaleString()}</p>}
            {error && <p className="mt-4 text-xs text-red-300/80">{error}</p>}
          </div>

          <aside className="space-y-4">
            <div className="rounded-[2rem] border border-lime-200/15 bg-lime-200/[0.045] p-6 sm:p-8">
              <p className="text-[9px] uppercase tracking-[0.18em] text-lime-200/60">Companion actions</p>
              <div className="mt-6 space-y-5">
                {[
                  [Brain, "Recall", "Bring only approved context into this conversation."],
                  [Sparkles, "Remember", "Propose something you explicitly asked it to keep."],
                  [Globe2, "Research", "Read approved public sources with evidence preserved."],
                  [ShieldCheck, "Introduce", "Look privately for one bilateral human possibility."],
                ].map(([Icon, title, body]) => {
                  const ActionIcon = Icon as typeof Brain;
                  return <div key={title as string} className="grid grid-cols-[2.25rem_1fr] gap-3"><span className="grid size-8 place-items-center rounded-full border border-white/10 text-lime-200/70"><ActionIcon className="size-3.5" /></span><div><p className="text-xs font-medium text-stone-200">{title as ReactNode}</p><p className="mt-1 text-[11px] leading-5 text-stone-500">{body as ReactNode}</p></div></div>;
                })}
              </div>
            </div>
            <p className="px-2 text-[10px] leading-5 text-stone-600">Sylla never receives the host’s subscription credentials. The host uses its own model allowance while the conversation is active; Sylla meters only its own Solari and fallback work.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}

function AppShell({ initialState }: { initialState: SyllaSessionState }) {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<View>(state.stage === "review" ? "memory" : "conversation");
  const [paused, setPaused] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const pending = state.observations.filter((item) => item.status === "pending").length;

  async function withdraw() {
    if (!window.confirm(`Withdraw from ${state.event.name}? This immediately removes you from matching and releases active access.`)) return;
    const payload = await api("/api/participation", { method: "DELETE" });
    if (payload.state) setState(payload.state);
  }

  if (state.stage === "withdrawn") {
    return <WithdrawnScreen eventName={state.event.name} />;
  }

  return (
    <main className="observatory-shell relative flex min-h-svh overflow-hidden bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/[0.07] bg-black/20 p-4 md:flex lg:w-64 lg:p-5">
        <div className="flex items-center gap-3 px-1 py-1">
          <span className="relative grid size-7 place-items-center rounded-full border border-lime-200/25">
            <span className="size-1.5 rounded-full bg-lime-200" />
          </span>
          <div>
            <p className="font-heading text-base italic text-stone-100">Sylla</p>
            <p className="text-[8px] uppercase tracking-[0.2em] text-stone-500">Relationship layer</p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3">
          <p className="text-[8px] uppercase tracking-[0.18em] text-stone-600">Your agent</p>
          <p className="mt-1 font-heading text-xl italic text-stone-200">{state.agentName}</p>
        </div>

        <nav className="mt-7 space-y-1" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors",
                  active ? "bg-white/[0.065] text-stone-100" : "text-stone-500 hover:bg-white/[0.035] hover:text-stone-300",
                )}
              >
                <Icon className="size-3.5" /> {item.label}
                {item.id === "memory" && pending > 0 && (
                  <span className="ml-auto grid size-5 place-items-center rounded-full bg-amber-200/[0.1] text-[9px] text-amber-200">{pending}</span>
                )}
                {active && item.id !== "memory" && <span className="ml-auto size-1 rounded-full bg-lime-200" />}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5">
          <div className="flex items-center gap-2.5">
            <span className={cn("size-2 rounded-full", paused ? "bg-amber-300" : "bg-lime-200")} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-stone-300">{paused ? `${state.agentName} is paused` : `${state.agentName} is available`}</p>
              <p className="mt-0.5 text-[9px] text-stone-600">No hidden background tasks</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPaused((value) => !value)} className="mt-3 w-full justify-start text-[10px] text-stone-500">
            {paused ? <CirclePlay /> : <CirclePause />} {paused ? "Resume agent" : "Pause agent"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void withdraw()} className="mt-1 w-full justify-start text-[10px] text-stone-600 hover:text-red-300">
            <X /> Withdraw from event
          </Button>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-white/[0.07] px-4 sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <span className="size-2 rounded-full bg-lime-200" />
            <span className="font-heading italic">{state.agentName}</span>
          </div>
          <nav className="ml-4 flex items-center gap-0.5 md:hidden" aria-label="Mobile navigation">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" aria-label={item.label} onClick={() => setView(item.id)} className={cn("relative grid size-8 place-items-center rounded-lg", view === item.id ? "bg-white/[0.07] text-lime-200" : "text-stone-500")}>
                  <Icon className="size-3.5" />
                  {item.id === "memory" && pending > 0 && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-200" />}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="border-white/10 bg-white/[0.02] text-[9px] text-stone-500">
              {state.research.provider === "solari" ? "Live Solari" : "Safe mock"}
            </Badge>
            <Badge variant="outline" className="hidden border-white/10 bg-white/[0.02] text-[9px] text-stone-600 sm:inline-flex">
              Private session
            </Badge>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {view === "conversation" && (
            <ConversationView state={state} onChange={setState} openMemory={() => setView("memory")} openWorkspace={() => setView("workspace")} />
          )}
          {view === "connections" && <ConnectionsView agentName={state.agentName} />}
          {view === "memory" && (
            <MemoryView state={state} onChange={setState} openWorkspace={() => setView("workspace")} />
          )}
          {view === "workspace" && (
            <WorkspaceView state={state} onChange={setState} streamUrl={streamUrl} onStream={setStreamUrl} />
          )}
          <RuntimeRail state={state} openWorkspace={() => setView("workspace")} />
        </div>
      </div>
    </main>
  );
}

export function SyllaShell() {
  const [state, setState] = useState<SyllaSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOnboardingConnections, setShowOnboardingConnections] = useState(false);

  async function retry() {
    setError(null);
    try {
      const payload = await api("/api/session");
      if (payload.state) setState(payload.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sylla could not load.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    void api("/api/session")
      .then((payload) => {
        if (!cancelled && payload.state) setState(payload.state);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Sylla could not load.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorScreen error={error} retry={() => void retry()} />;
  if (!state) return <LoadingScreen />;
  if (state.stage === "withdrawn") return <WithdrawnScreen eventName={state.event.name} />;
  if (showOnboardingConnections && (state.stage === "consent" || state.stage === "new")) {
    return (
      <main className="observatory-shell min-h-svh bg-background text-foreground">
        <header className="flex h-14 items-center border-b border-white/[0.07] px-5 sm:px-10">
          <button
            type="button"
            onClick={() => setShowOnboardingConnections(false)}
            className="text-[10px] uppercase tracking-[0.16em] text-stone-500 transition-colors hover:text-lime-200"
          >
            ← Back to setup
          </button>
          <span className="ml-auto font-heading italic text-stone-200">Sylla</span>
        </header>
        <ConnectionsView agentName={state.agentName} />
      </main>
    );
  }
  if (state.stage === "consent") {
    return (
      <ConsentScreen
        state={state}
        onComplete={setState}
        onConnect={() => setShowOnboardingConnections(true)}
      />
    );
  }
  if (state.stage === "new") {
    return (
      <FirstSession
        onComplete={setState}
        onConnect={() => setShowOnboardingConnections(true)}
      />
    );
  }
  return <AppShell initialState={state} />;
}
