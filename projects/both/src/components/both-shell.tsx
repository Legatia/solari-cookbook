"use client";

import { type FormEvent, useState } from "react";
import {
  ArrowUpRight,
  Box,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePause,
  CirclePlay,
  ExternalLink,
  Globe2,
  LockKeyhole,
  MessageCircle,
  Monitor,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type View = "conversation" | "workspace" | "memory";

const navigation = [
  { id: "conversation" as const, label: "Conversation", icon: MessageCircle },
  { id: "workspace" as const, label: "Workspace", icon: Monitor },
  { id: "memory" as const, label: "Memory", icon: Brain },
];

const evidence = [
  {
    kind: "Observed",
    title: "Community gardening",
    detail: "You have returned to this subject across two approved essays.",
    source: "2 public sources",
    tone: "lime",
  },
  {
    kind: "Inferred",
    title: "Small groups over crowds",
    detail: "A tentative preference. You can correct or forget it.",
    source: "Needs confirmation",
    tone: "amber",
  },
];

const memory = [
  {
    title: "Thoughtful follow-up matters more than instant chemistry",
    origin: "Told to me",
    status: "Confirmed",
  },
  {
    title: "You enjoy meeting people outside your professional orbit",
    origin: "Inferred",
    status: "Pending",
  },
];

function RuntimeMark({
  icon: Icon,
  label,
  state,
}: {
  icon: typeof Globe2;
  label: string;
  state: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-stone-400">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-stone-300">{label}</p>
        <p className="truncate text-[10px] text-stone-500">{state}</p>
      </div>
    </div>
  );
}

function ConversationView({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const [message, setMessage] = useState("");
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMessage = message.trim();

    if (!nextMessage) return;
    setSentMessage(nextMessage);
    setMessage("");
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-10 lg:px-14">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-end">
          <div className="mb-12 flex items-center gap-4">
            <div className="agent-orbit relative grid size-14 shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.055]">
              <span className="size-2 rounded-full bg-lime-200 shadow-[0_0_24px_rgba(217,249,157,0.75)]" />
            </div>
            <div>
              <p className="font-heading text-xl italic text-stone-200">I have been looking.</p>
              <p className="mt-1 text-xs text-stone-500">Research completed 4 minutes ago</p>
            </div>
          </div>

          <div className="max-w-xl animate-rise">
            <h1 className="font-heading text-[clamp(2rem,4vw,3.65rem)] leading-[0.98] tracking-[-0.045em] text-stone-100">
              There is someone at Thursday’s gathering I think you may genuinely
              appreciate.
            </h1>
            <p className="mt-7 max-w-lg text-[15px] leading-7 text-stone-400">
              You both care about how neighborhoods become communities, but you
              approach the question from opposite sides.
            </p>

            {showReason && (
              <div className="mt-7 border-l border-lime-200/40 pl-5 text-sm leading-6 text-stone-400">
                <p className="text-stone-200">The short reason</p>
                <p className="mt-1.5">
                  You write about shared spaces; they organize them. The difference
                  is concrete enough to create a real conversation, not just shared
                  keywords.
                </p>
              </div>
            )}

            {sentMessage && (
              <div className="ml-auto mt-8 max-w-md rounded-2xl rounded-br-sm bg-stone-100 px-5 py-3 text-sm leading-6 text-stone-900">
                {sentMessage}
              </div>
            )}

            <div className="mt-9 flex flex-wrap gap-2.5">
              <Button
                size="lg"
                onClick={() => setShowReason((value) => !value)}
                className="h-10 rounded-full bg-lime-200 px-4 text-xs font-semibold text-stone-950 hover:bg-lime-100"
              >
                {showReason ? "Hide reason" : "Give me the short reason"}
                <ChevronRight className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={onOpenWorkspace}
                className="h-10 rounded-full border-white/10 bg-transparent px-4 text-xs text-stone-300 hover:bg-white/5"
              >
                Open the evidence
                <ArrowUpRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-white/[0.07] p-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-2xl items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-2 pl-4 shadow-[0_18px_80px_rgba(0,0,0,0.24)] focus-within:border-lime-200/25">
          <label htmlFor="agent-message" className="sr-only">
            Message your agent
          </label>
          <textarea
            id="agent-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={1}
            placeholder="Ask one thing…"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-stone-200 outline-none placeholder:text-stone-500"
          />
          <Button
            type="submit"
            size="icon-lg"
            aria-label="Send message"
            className="rounded-xl bg-stone-100 text-stone-950 hover:bg-white"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mx-auto mt-2.5 max-w-2xl px-1 text-[10px] tracking-wide text-stone-500">
          Nothing becomes memory without your approval.
        </p>
      </form>
    </section>
  );
}

function WorkspaceView() {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-4xl animate-rise">
        <div className="flex flex-col justify-between gap-5 border-b border-white/[0.08] pb-7 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-lime-200/70">
              <span className="size-1.5 rounded-full bg-lime-200" />
              Live workspace
            </div>
            <h1 className="font-heading text-4xl italic tracking-tight text-stone-100 sm:text-5xl">
              What I’m seeing
            </h1>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs text-stone-400">Thursday Assembly</p>
            <p className="mt-1 text-[11px] text-stone-500">Warsaw · 12 September</p>
          </div>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="paper-grid relative min-h-80 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#121512] p-6">
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-stone-400">
                <Search className="size-3.5" />
                Research board
              </div>
              <Badge className="border-lime-100/15 bg-lime-200/[0.08] text-[10px] text-lime-100">
                6 sources
              </Badge>
            </div>

            <div className="relative z-10 mt-9 space-y-3">
              {evidence.map((item, index) => (
                <div
                  key={item.title}
                  className={cn(
                    "max-w-sm rounded-xl border p-4 backdrop-blur-sm transition-transform hover:-translate-y-0.5",
                    index === 1 ? "ml-8" : "",
                    item.tone === "lime"
                      ? "border-lime-200/15 bg-lime-50/[0.045]"
                      : "border-amber-200/15 bg-amber-50/[0.04]",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] uppercase tracking-[0.18em] text-stone-500">
                      {item.kind}
                    </span>
                    <ExternalLink className="size-3 text-stone-500" />
                  </div>
                  <h2 className="mt-2 text-sm font-medium text-stone-200">{item.title}</h2>
                  <p className="mt-1.5 text-xs leading-5 text-stone-500">{item.detail}</p>
                  <p className="mt-3 text-[10px] text-stone-500">{item.source}</p>
                </div>
              ))}
            </div>
          </article>

          <div className="space-y-4">
            <article className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-stone-300">Current hypothesis</p>
                <Sparkles className="size-3.5 text-lime-200/70" />
              </div>
              <p className="mt-6 font-heading text-2xl italic leading-tight text-stone-200">
                Difference may be more useful here than similarity.
              </p>
              <p className="mt-4 text-xs leading-5 text-stone-500">
                Confidence is intentionally medium. You will approve the exact
                rationale before anyone sees it.
              </p>
              <div className="mt-5 flex items-center gap-2 border-t border-white/[0.07] pt-4 text-[10px] text-stone-500">
                <ShieldCheck className="size-3.5" />
                4 approved observations · 1 inference
              </div>
            </article>

            <article className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5">
              <p className="text-xs font-medium text-stone-300">Activity</p>
              <div className="mt-5 space-y-4">
                {[
                  ["Read approved public sources", "Complete"],
                  ["Compared 14 opt-in participants", "Complete"],
                  ["Preparing bilateral evaluation", "Next"],
                ].map(([label, state], index) => (
                  <div key={label} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded-full border text-[9px]",
                        index < 2
                          ? "border-lime-200/20 bg-lime-200/[0.08] text-lime-200"
                          : "border-white/10 text-stone-500",
                      )}
                    >
                      {index < 2 ? <Check className="size-3" /> : "3"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-stone-400">{label}</p>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider text-stone-500">
                      {state}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

function MemoryView() {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-3xl animate-rise">
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Memory ledger</p>
        <h1 className="mt-3 font-heading text-4xl italic tracking-tight text-stone-100 sm:text-5xl">
          What stays is your decision.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-stone-500">
          Origin tells you where an idea came from. Status tells you whether it
          may shape future introductions. They are never the same thing.
        </p>

        <div className="mt-9 space-y-3">
          {memory.map((item) => (
            <article
              key={item.title}
              className="group rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5 transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex gap-4">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-white/10 text-stone-500">
                  <LockKeyhole className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6 text-stone-200">{item.title}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-white/10 text-[10px] text-stone-500">
                      Origin · {item.origin}
                    </Badge>
                    <Badge
                      className={cn(
                        "text-[10px]",
                        item.status === "Confirmed"
                          ? "bg-lime-200/[0.09] text-lime-100"
                          : "bg-amber-200/[0.09] text-amber-100",
                      )}
                    >
                      Status · {item.status}
                    </Badge>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-[10px] text-stone-500">
                  Review
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BothShell() {
  const [view, setView] = useState<View>("conversation");
  const [agentPaused, setAgentPaused] = useState(false);

  return (
    <main className="observatory-shell relative flex min-h-svh overflow-hidden bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/[0.07] bg-black/20 p-4 md:flex lg:w-64 lg:p-5">
        <div className="flex items-center gap-3 px-1 py-1">
          <span className="relative grid size-7 place-items-center rounded-full border border-lime-200/25">
            <span className="size-1.5 rounded-full bg-lime-200" />
          </span>
          <div>
            <p className="font-heading text-base italic text-stone-100">Both</p>
            <p className="text-[8px] uppercase tracking-[0.2em] text-stone-500">Personal agent</p>
          </div>
        </div>

        <nav className="mt-11 space-y-1" aria-label="Primary navigation">
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
                  active
                    ? "bg-white/[0.065] text-stone-100"
                    : "text-stone-500 hover:bg-white/[0.035] hover:text-stone-300",
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
                {active && <span className="ml-auto size-1 rounded-full bg-lime-200" />}
              </button>
            );
          })}
        </nav>

        <div className="mt-8 px-3">
          <p className="text-[9px] uppercase tracking-[0.18em] text-stone-500">Next gathering</p>
          <div className="mt-3 flex gap-3">
            <CalendarDays className="mt-0.5 size-3.5 text-stone-500" />
            <div>
              <p className="text-xs text-stone-400">Thursday Assembly</p>
              <p className="mt-1 text-[10px] text-stone-500">12 Sep · 18:30</p>
            </div>
          </div>
        </div>

        <div className="mt-auto rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "relative size-2 rounded-full",
                agentPaused ? "bg-amber-300" : "bg-lime-200",
              )}
            >
              {!agentPaused && <span className="absolute inset-0 animate-ping rounded-full bg-lime-200/50" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-stone-300">
                {agentPaused ? "Agent paused" : "Agent is researching"}
              </p>
              <p className="mt-0.5 text-[9px] text-stone-500">
                {agentPaused ? "No active tasks" : "1 visible task"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAgentPaused((value) => !value)}
            className="mt-3 w-full justify-start text-[10px] text-stone-500 hover:text-stone-300"
          >
            {agentPaused ? <CirclePlay /> : <CirclePause />}
            {agentPaused ? "Resume agent" : "Pause agent"}
          </Button>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-white/[0.07] px-4 sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <span className="size-2 rounded-full bg-lime-200" />
            <span className="font-heading italic">Both</span>
          </div>
          <nav className="ml-4 flex items-center gap-0.5 md:hidden" aria-label="Mobile navigation">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView(item.id)}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg",
                    active ? "bg-white/[0.07] text-lime-200" : "text-stone-500",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden border-white/10 bg-white/[0.02] text-[9px] text-stone-500 sm:inline-flex">
              Alpha · mock mode
            </Badge>
            <Button variant="ghost" size="icon-sm" aria-label="View participants" className="text-stone-500">
              <Users />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {view === "conversation" && (
            <ConversationView onOpenWorkspace={() => setView("workspace")} />
          )}
          {view === "workspace" && <WorkspaceView />}
          {view === "memory" && <MemoryView />}

          <aside className="hidden w-72 shrink-0 flex-col border-l border-white/[0.07] bg-black/10 p-5 xl:flex">
            <div className="flex items-center justify-between">
              <p className="text-[9px] uppercase tracking-[0.2em] text-stone-500">Agent computer</p>
              <span className="flex items-center gap-1.5 text-[9px] text-lime-200/70">
                <span className="size-1.5 rounded-full bg-lime-200" /> Live
              </span>
            </div>

            <button
              type="button"
              onClick={() => setView("workspace")}
              className="paper-grid group relative mt-4 aspect-[4/3] overflow-hidden rounded-xl border border-white/[0.09] bg-[#101310] text-left"
            >
              <div className="absolute inset-x-3 top-3 flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-red-300/40" />
                <span className="size-1.5 rounded-full bg-amber-300/40" />
                <span className="size-1.5 rounded-full bg-lime-300/40" />
              </div>
              <div className="absolute inset-x-4 bottom-4 space-y-2">
                <div className="h-1.5 w-4/5 rounded-full bg-stone-600/20" />
                <div className="h-1.5 w-3/5 rounded-full bg-lime-200/15" />
                <div className="mt-4 flex items-center justify-between text-[9px] text-stone-500">
                  Evidence board
                  <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
              </div>
            </button>

            <div className="mt-7 space-y-4">
              <RuntimeMark icon={Globe2} label="Browser" state="6 approved sources read" />
              <RuntimeMark icon={Monitor} label="Desktop" state="Workspace visible" />
              <RuntimeMark icon={Box} label="Sandbox" state="Waiting for consent" />
            </div>

            <div className="mt-auto border-t border-white/[0.07] pt-5">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-stone-500" />
                <p className="text-[10px] leading-4 text-stone-500">
                  This is a managed cloud workspace. It cannot see your physical
                  computer.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
