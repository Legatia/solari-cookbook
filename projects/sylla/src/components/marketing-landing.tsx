import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Eye,
  Fingerprint,
  Globe2,
  LockKeyhole,
  MoveRight,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

const githubUrl = "https://github.com/Legatia/solari-cookbook";

function Wordmark() {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="Sylla home">
      <span className="relative grid size-8 place-items-center rounded-full border border-lime-200/25 bg-lime-200/[0.06]">
        <span className="size-1.5 rounded-full bg-lime-200 shadow-[0_0_18px_rgba(217,249,157,0.7)]" />
        <span className="absolute inset-1 rounded-full border border-lime-200/10 transition-transform duration-500 group-hover:rotate-45" />
      </span>
      <span className="font-heading text-xl italic tracking-[-0.03em] text-stone-100">
        Sylla
      </span>
    </Link>
  );
}

function SignalLine({ delay = "0ms" }: { delay?: string }) {
  return (
    <span className="relative h-px flex-1 overflow-hidden bg-white/10">
      <span
        className="marketing-signal absolute inset-y-0 left-0 w-16 bg-lime-200"
        style={{ animationDelay: delay }}
      />
    </span>
  );
}

function ConsentNode({
  label,
  detail,
  side,
  delay,
}: {
  label: string;
  detail: string;
  side: "left" | "right";
  delay: string;
}) {
  return (
    <div className={`relative z-10 flex items-center gap-3 ${side === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span
        className="marketing-node grid size-11 shrink-0 place-items-center rounded-full border border-lime-200/25 bg-[#101510] text-lime-200 shadow-[0_0_0_7px_rgba(217,249,157,0.025)]"
        style={{ animationDelay: delay }}
      >
        <Check className="size-4" strokeWidth={1.8} />
      </span>
      <span>
        <span className="block text-xs font-medium text-stone-200">{label}</span>
        <span className="mt-0.5 block font-mono text-[8px] uppercase tracking-[0.18em] text-stone-600">
          {detail}
        </span>
      </span>
    </div>
  );
}

function IntroductionInstrument() {
  return (
    <div className="marketing-instrument relative isolate min-h-[32rem] overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0f0c] p-5 shadow-[0_45px_100px_rgba(0,0,0,0.35)] sm:p-8">
      <div className="flex items-center justify-between border-b border-white/[0.07] pb-5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500">
            Private introduction · 01
          </p>
          <p className="mt-1.5 text-xs text-stone-300">Four gates. One human possibility.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-lime-200/15 bg-lime-200/[0.04] px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-lime-200/70">
          <span className="size-1.5 rounded-full bg-lime-200" /> Live hypothesis
        </span>
      </div>

      <div className="relative mt-9 grid grid-cols-[1fr_4rem_1fr] items-center gap-y-12 sm:grid-cols-[1fr_7rem_1fr]">
        <ConsentNode label="Your agent" detail="recommends" side="left" delay="300ms" />
        <SignalLine delay="700ms" />
        <ConsentNode label="Their agent" detail="recommends" side="right" delay="500ms" />

        <ConsentNode label="You" detail="accept privately" side="left" delay="900ms" />
        <div className="relative flex items-center">
          <SignalLine delay="1300ms" />
          <span className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-lime-200/20 bg-[#0b0f0c]">
            <Sparkles className="size-4 text-lime-200" strokeWidth={1.5} />
          </span>
        </div>
        <ConsentNode label="They" detail="accept privately" side="right" delay="1100ms" />
      </div>

      <div className="mt-12 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-lime-200 text-[#101510]">
            <LockKeyhole className="size-3.5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-medium text-stone-200">Identity stays sealed</p>
              <p className="font-mono text-[8px] uppercase tracking-[0.17em] text-lime-200/60">
                4 / 4 required
              </p>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="marketing-progress h-full w-full rounded-full bg-lime-200" />
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute -bottom-32 -right-24 size-72 rounded-full border border-lime-200/[0.06]" />
      <div className="pointer-events-none absolute -bottom-20 -right-10 size-52 rounded-full border border-lime-200/[0.08]" />
    </div>
  );
}

const steps = [
  {
    number: "01",
    title: "Talk where you already talk.",
    body: "Connect Sylla to the AI you already use. Name your agent yourself; keep it when you change models.",
  },
  {
    number: "02",
    title: "Teach it with permission.",
    body: "Approve every source and every memory. Private stays private. Inferences wait for your correction.",
  },
  {
    number: "03",
    title: "Meet who you’re missing.",
    body: "At an opted-in event, two agents form one hypothesis. Nobody is revealed until both people say yes.",
  },
];

const solariSurfaces = [
  {
    name: "Browser",
    label: "Research",
    body: "Visits only the public sources you approve and preserves evidence beside every claim.",
  },
  {
    name: "Desktop",
    label: "Home",
    body: "A persistent, inspectable workbench for the rich context that should never be flattened into a chat reply.",
  },
  {
    name: "Sandbox",
    label: "Judgment",
    body: "Evaluates each side independently inside a disposable boundary, then destroys the environment.",
  },
];

const trustPoints = [
  {
    Icon: Eye,
    title: "Inspectable",
    body: "Every belief has a source, a confidence level, and a visible history.",
  },
  {
    Icon: LockKeyhole,
    title: "Permissioned",
    body: "Nothing becomes memory or crosses to another person without your approval.",
  },
  {
    Icon: Globe2,
    title: "Portable",
    body: "Your identity and approved context belong to Sylla—not to whichever model happens to be open.",
  },
];

export function MarketingLanding() {
  return (
    <main className="marketing-page min-h-svh overflow-hidden bg-[#0b0e0b] text-stone-100">
      <nav className="relative z-30 mx-auto flex max-w-[92rem] items-center justify-between px-5 py-6 sm:px-9 lg:px-14">
        <Wordmark />
        <div className="hidden items-center gap-8 text-[11px] text-stone-500 md:flex">
          <a href="#how" className="transition-colors hover:text-stone-100">How it works</a>
          <a href="#trust" className="transition-colors hover:text-stone-100">Trust</a>
          <a href="#solari" className="transition-colors hover:text-stone-100">Built with Solari</a>
        </div>
        <Link
          href="/app"
          className="group inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-300 transition hover:border-lime-200/25 hover:text-lime-200"
        >
          Open prototype <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </nav>

      <section className="relative mx-auto grid max-w-[92rem] gap-14 px-5 pb-24 pt-14 sm:px-9 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-20 lg:px-14 lg:pb-32 lg:pt-24">
        <div className="relative z-10 max-w-4xl">
          <div className="marketing-rise flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.24em] text-lime-200/65">
            <span className="h-px w-9 bg-lime-200/40" /> The portable relationship layer
          </div>
          <h1 className="marketing-rise mt-8 font-heading text-[clamp(4rem,9.4vw,9.2rem)] font-normal leading-[0.78] tracking-[-0.075em]" style={{ animationDelay: "100ms" }}>
            Keep the agent.
            <span className="mt-3 block italic text-lime-200">Meet the missing.</span>
          </h1>
          <p className="marketing-rise mt-10 max-w-2xl text-base leading-8 text-stone-400 sm:text-lg sm:leading-9" style={{ animationDelay: "220ms" }}>
            Sylla gives you a personal agent that grows with your permission, travels across the AI models you use, and notices the people you may genuinely want to know.
          </p>
          <div className="marketing-rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "320ms" }}>
            <Link
              href="/app"
              className="group inline-flex h-12 items-center gap-3 rounded-full bg-lime-200 px-6 text-xs font-semibold text-[#111610] transition hover:bg-[#e5ffad]"
            >
              Meet your agent <MoveRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 px-6 text-xs text-stone-400 transition hover:border-white/20 hover:text-stone-100"
            >
              See the public build <ArrowUpRight className="size-3.5" />
            </a>
          </div>
          <div className="marketing-rise mt-12 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/[0.07] pt-5 font-mono text-[8px] uppercase tracking-[0.16em] text-stone-600" style={{ animationDelay: "420ms" }}>
            <span className="inline-flex items-center gap-2"><span className="size-1 rounded-full bg-lime-200" /> You name the agent</span>
            <span className="inline-flex items-center gap-2"><span className="size-1 rounded-full bg-lime-200" /> You approve the memory</span>
            <span className="inline-flex items-center gap-2"><span className="size-1 rounded-full bg-lime-200" /> You make the decision</span>
          </div>
        </div>

        <div className="marketing-rise relative z-10 lg:pt-8" style={{ animationDelay: "260ms" }}>
          <IntroductionInstrument />
        </div>
        <div className="pointer-events-none absolute -left-32 top-1/4 h-px w-[42rem] -rotate-12 bg-gradient-to-r from-transparent via-lime-200/[0.08] to-transparent" />
      </section>

      <a href="#how" className="mx-auto mb-12 flex w-fit flex-col items-center gap-2 font-mono text-[8px] uppercase tracking-[0.2em] text-stone-600 transition hover:text-stone-300">
        The idea in 60 seconds <ArrowDown className="size-3 animate-bounce" />
      </a>

      <section className="overflow-hidden border-y border-white/[0.07] bg-[#dff8a7] py-3 text-[#111610]">
        <div className="marketing-marquee flex w-max items-center gap-10 whitespace-nowrap font-mono text-[9px] font-medium uppercase tracking-[0.18em]">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center gap-10" aria-hidden={copy === 1}>
              <span>Not a feed</span><span>✦</span><span>Not a compatibility score</span><span>✦</span><span>Not another inbox</span><span>✦</span><span>Your agent, your memory, your call</span><span>✦</span>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-[92rem] px-5 py-28 sm:px-9 lg:px-14 lg:py-40">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-lime-200/60">How it works</p>
            <h2 className="mt-5 max-w-md font-heading text-5xl leading-[0.95] tracking-[-0.05em] sm:text-6xl">
              Conversation is the relationship. <em className="text-stone-500">The workspace is the evidence.</em>
            </h2>
          </div>
          <div className="border-t border-white/10">
            {steps.map((step) => (
              <div key={step.number} className="group grid gap-5 border-b border-white/10 py-8 sm:grid-cols-[4rem_1fr_1fr] sm:items-start sm:gap-8">
                <span className="font-mono text-[9px] text-lime-200/50">{step.number}</span>
                <h3 className="font-heading text-3xl tracking-[-0.035em] text-stone-200 transition-colors group-hover:text-lime-200">{step.title}</h3>
                <p className="text-sm leading-7 text-stone-500">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="relative border-y border-white/[0.07] bg-[#ece8de] text-[#171b16]">
        <div className="mx-auto grid max-w-[92rem] lg:grid-cols-[1.15fr_0.85fr]">
          <div className="px-5 py-24 sm:px-9 lg:border-r lg:border-black/10 lg:px-14 lg:py-36">
            <Fingerprint className="size-7 text-[#536b2d]" strokeWidth={1.2} />
            <blockquote className="mt-10 max-w-4xl font-heading text-[clamp(3.2rem,6vw,6.8rem)] leading-[0.88] tracking-[-0.065em]">
              Intimacy should be <em>earned, legible,</em> and reversible.
            </blockquote>
          </div>
          <div className="grid border-t border-black/10 lg:border-t-0">
            {trustPoints.map(({ Icon, title, body }) => (
              <div key={title} className="grid grid-cols-[3rem_1fr] gap-5 border-b border-black/10 px-5 py-9 last:border-b-0 sm:px-9 lg:px-12">
                <Icon className="mt-1 size-5 text-[#536b2d]" strokeWidth={1.3} />
                <div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-7 text-black/55">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="solari" className="mx-auto max-w-[92rem] px-5 py-28 sm:px-9 lg:px-14 lg:py-40">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-lime-200/60">The agent has somewhere to work</p>
            <h2 className="mt-5 max-w-3xl font-heading text-5xl leading-[0.92] tracking-[-0.055em] sm:text-7xl">Three Solari surfaces. <em className="text-stone-500">One continuous self.</em></h2>
          </div>
          <p className="max-w-sm text-sm leading-7 text-stone-500">The model reasons. Sylla decides what is allowed. Solari gives the agent a browser, a home, and a clean room.</p>
        </div>

        <div className="mt-16 grid border-y border-white/10 lg:grid-cols-3">
          {solariSurfaces.map((surface, index) => (
            <article key={surface.name} className="group relative min-h-72 overflow-hidden border-b border-white/10 p-7 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 lg:p-9">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-stone-600">0{index + 1} / {surface.label}</span>
                <span className="size-2 rounded-full border border-lime-200/40 transition group-hover:bg-lime-200 group-hover:shadow-[0_0_18px_rgba(217,249,157,0.5)]" />
              </div>
              <h3 className="mt-14 font-heading text-5xl italic tracking-[-0.04em] text-stone-200">{surface.name}</h3>
              <p className="mt-5 max-w-sm text-sm leading-7 text-stone-500">{surface.body}</p>
              <div className="absolute -bottom-14 -right-14 size-36 rounded-full border border-white/[0.04] transition-transform duration-700 group-hover:scale-125" />
            </article>
          ))}
        </div>
      </section>

      <section className="relative mx-3 mb-3 overflow-hidden rounded-[2rem] bg-lime-200 px-5 py-24 text-[#111610] sm:mx-5 sm:px-9 lg:px-14 lg:py-32">
        <div className="relative z-10 mx-auto flex max-w-[84rem] flex-col items-start justify-between gap-12 lg:flex-row lg:items-end">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/50">The question underneath everything</p>
            <h2 className="mt-5 font-heading text-[clamp(4rem,9vw,9rem)] leading-[0.8] tracking-[-0.075em]">Who are you<br /><em>missing?</em></h2>
          </div>
          <div className="max-w-sm">
            <p className="text-sm leading-7 text-black/60">The first Sylla experiment is simple: one opted-in event, one person neither of you would have found, one conversation worth having.</p>
            <Link href="/app" className="group mt-7 inline-flex h-12 items-center gap-3 rounded-full bg-[#111610] px-6 text-xs font-semibold text-lime-200">
              Open the prototype <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-28 -top-28 size-[28rem] rounded-full border border-black/10" />
        <div className="pointer-events-none absolute -right-14 -top-14 size-[20rem] rounded-full border border-black/10" />
      </section>

      <footer className="mx-auto flex max-w-[92rem] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-9 lg:px-14">
        <Wordmark />
        <p className="max-w-lg text-xs leading-6 text-stone-600">The portable relationship layer for personal agents. Social discovery is the first proof, not the limit.</p>
        <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-stone-500 transition hover:text-lime-200">Public repository <ArrowUpRight className="size-3" /></a>
      </footer>
    </main>
  );
}
