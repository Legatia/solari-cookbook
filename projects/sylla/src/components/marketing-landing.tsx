import {
  ArrowDown,
  ArrowUpRight,
  Bot,
  Check,
  Eye,
  Globe2,
  LockKeyhole,
  MessageCircle,
  MonitorUp,
  MoveRight,
  ShieldCheck,
  Waypoints,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const githubUrl = "https://github.com/Legatia/solari-cookbook";

function Wordmark() {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="Sylla home">
      <span className="grid size-9 place-items-center overflow-hidden rounded-[11px] bg-[#eae7e0] transition-transform duration-500 group-hover:-rotate-3">
        <Image
          src="/brand/sylla-mark-primary.svg"
          alt=""
          width={30}
          height={30}
          className="size-[30px]"
          priority
        />
      </span>
      <span className="font-heading text-[1.4rem] italic tracking-[-0.045em] text-[#0b0b0a]">
        Sylla
      </span>
    </Link>
  );
}

function Kicker({ children, invert = false }: { children: React.ReactNode; invert?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.24em] ${
        invert ? "text-[#b8b3aa]" : "text-[#6e6a63]"
      }`}
    >
      <span className={`h-px w-8 ${invert ? "bg-[#f4f0e8]/35" : "bg-[#0b0b0a]/30"}`} />
      {children}
    </div>
  );
}

function PermissionPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#0b0b0a]/10 bg-[#fffdf8]/70 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#5e5a54]">
      <span className="size-1 rounded-full bg-[#0b0b0a]" />
      {children}
    </span>
  );
}

function FeatureLine({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Eye;
  title: string;
  body: string;
}) {
  return (
    <div className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-[#0b0b0a]/10 py-6 first:border-t-0">
      <span className="grid size-10 place-items-center rounded-full border border-[#0b0b0a]/12 text-[#0b0b0a]">
        <Icon className="size-4" strokeWidth={1.5} />
      </span>
      <div>
        <h3 className="text-sm font-medium text-[#0b0b0a]">{title}</h3>
        <p className="mt-2 max-w-xl text-[13px] leading-6 text-[#6e6a63]">{body}</p>
      </div>
    </div>
  );
}

function SystemLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#8e8980]">
      {children}
    </span>
  );
}

export function MarketingLanding() {
  return (
    <main className="sylla-landing min-h-svh overflow-hidden bg-[#eae7e0] text-[#0b0b0a]">
      <nav className="relative z-40 mx-auto flex max-w-[96rem] items-center justify-between px-5 py-5 sm:px-9 lg:px-14">
        <Wordmark />
        <div className="hidden items-center gap-7 text-[11px] text-[#6e6a63] lg:flex">
          <a href="#relationship" className="transition-colors hover:text-[#0b0b0a]">The relationship</a>
          <a href="#introductions" className="transition-colors hover:text-[#0b0b0a]">Private introductions</a>
          <a href="#society" className="transition-colors hover:text-[#0b0b0a]">Agent society</a>
          <a href="#infrastructure" className="transition-colors hover:text-[#0b0b0a]">How it works</a>
        </div>
        <Link
          href="/app"
          className="group inline-flex h-10 items-center gap-2 rounded-full bg-[#0b0b0a] px-5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#f4f0e8] transition hover:bg-[#32302c]"
        >
          Meet your agent
          <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </nav>

      <section className="relative mx-auto min-h-[calc(100svh-80px)] max-w-[96rem] px-5 pb-14 pt-8 sm:px-9 lg:px-14 lg:pb-20 lg:pt-12">
        <div className="grid items-center gap-14 lg:grid-cols-[1.04fr_.96fr] lg:gap-10">
          <div className="relative z-10 max-w-4xl">
            <div className="sylla-reveal">
              <Kicker>MCP-first personal agent</Kicker>
            </div>
            <h1
              className="sylla-reveal mt-8 max-w-[14ch] font-heading text-[clamp(3.6rem,8vw,7.4rem)] font-normal leading-[0.86] tracking-[-0.07em]"
              style={{ animationDelay: "90ms" }}
            >
              The <span className="italic">intimate</span> agent.
            </h1>
            <p
              className="sylla-reveal mt-9 max-w-xl text-[15px] leading-7 text-[#5e5a54] sm:text-base sm:leading-8"
              style={{ animationDelay: "180ms" }}
            >
              Talk to it inside the AI app you already use. It remembers with
              permission, works while you are away, and quietly meets other
              private agents without exposing your life.
            </p>
            <div
              className="sylla-reveal mt-8 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "270ms" }}
            >
              <Link
                href="/app"
                className="group inline-flex h-13 items-center gap-3 rounded-full bg-[#0b0b0a] px-7 text-xs font-semibold text-[#f4f0e8] transition hover:bg-[#32302c]"
              >
                Meet your agent
                <MoveRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#relationship"
                className="inline-flex h-13 items-center gap-2 rounded-full border border-[#0b0b0a]/15 bg-[#fffdf8]/45 px-6 text-xs text-[#4d4943] transition hover:border-[#0b0b0a]/35 hover:bg-[#fffdf8]/80"
              >
                See how it feels <ArrowDown className="size-3.5" />
              </a>
            </div>
            <div
              className="sylla-reveal mt-10 flex flex-wrap gap-2"
              style={{ animationDelay: "360ms" }}
            >
              <PermissionPill>You name it</PermissionPill>
              <PermissionPill>You teach it</PermissionPill>
              <PermissionPill>You can leave with it</PermissionPill>
            </div>
          </div>

          <div className="sylla-reveal relative lg:pl-8" style={{ animationDelay: "300ms" }}>
            <div className="absolute -right-24 -top-24 hidden size-[30rem] opacity-[0.035] lg:block">
              <Image src="/brand/sylla-mark-ink.svg" alt="" fill className="object-contain" />
            </div>
            <div className="relative rounded-[2rem] border border-[#0b0b0a]/12 bg-[#fffdf8]/85 p-3 shadow-[0_28px_80px_rgba(11,11,10,0.08)] backdrop-blur-sm sm:p-4">
              <div className="rounded-[1.45rem] bg-[#0b0b0a] p-5 text-[#f4f0e8] sm:p-7">
                <div className="flex items-center justify-between border-b border-[#f4f0e8]/10 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="relative grid size-8 place-items-center rounded-[10px] bg-[#eae7e0]">
                      <Image src="/brand/sylla-mark-primary.svg" alt="" width={25} height={25} />
                      <span className="absolute -bottom-1 -right-1 size-2.5 rounded-full border-2 border-[#0b0b0a] bg-[#f4f0e8]" />
                    </span>
                    <div>
                      <p className="text-xs">Your agent</p>
                      <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[#8e8980]">Present in this conversation</p>
                    </div>
                  </div>
                  <LockKeyhole className="size-3.5 text-[#8e8980]" strokeWidth={1.5} />
                </div>

                <div className="space-y-5 py-7">
                  <div className="ml-auto max-w-[82%] rounded-[1.25rem_1.25rem_.35rem_1.25rem] bg-[#32302c] px-4 py-3">
                    <p className="text-[13px] leading-6 text-[#f4f0e8]">
                      I don&rsquo;t think I want to meet anyone new this month.
                    </p>
                  </div>
                  <div className="max-w-[88%]">
                    <SystemLabel>Your agent</SystemLabel>
                    <p className="mt-2 font-heading text-[1.22rem] italic leading-7 text-[#f4f0e8]">
                      Understood. Should I protect the rest of September from introductions, or was that only true today?
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-[#f4f0e8]/20 bg-[#f4f0e8] px-3.5 py-2 text-[10px] text-[#0b0b0a]">Until October</span>
                    <span className="rounded-full border border-[#f4f0e8]/15 px-3.5 py-2 text-[10px] text-[#b8b3aa]">Only today</span>
                    <span className="rounded-full border border-[#f4f0e8]/15 px-3.5 py-2 text-[10px] text-[#b8b3aa]">Let&rsquo;s talk first</span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-[#f4f0e8]/10 bg-[#f4f0e8]/[0.04] px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="size-3.5 text-[#f4f0e8]" strokeWidth={1.5} />
                    <span className="text-[10px] text-[#b8b3aa]">Nothing remembered without your answer</span>
                  </div>
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#77736c]">Inspectable</span>
                </div>
              </div>
            </div>
            <p className="mt-4 px-4 text-center font-mono text-[8px] uppercase tracking-[0.18em] text-[#817c74]">
              Less assistant. More relationship.
            </p>
          </div>
        </div>

        <div className="mt-16 grid border-y border-[#0b0b0a]/10 sm:grid-cols-3 lg:mt-20">
          {[
            ["No new social feed", "It begins in ChatGPT, Claude, and compatible AI hosts."],
            ["No blank slate", "The same private agent returns with the context you approved."],
            ["No platform lock-in", "Its identity and memory are portable by design."],
          ].map(([title, body], index) => (
            <div key={title} className="border-b border-[#0b0b0a]/10 py-6 sm:border-b-0 sm:border-r sm:px-7 sm:first:pl-0 sm:last:border-r-0">
              <span className="font-mono text-[9px] text-[#8e8980]">0{index + 1}</span>
              <p className="mt-3 text-sm font-medium">{title}</p>
              <p className="mt-2 max-w-sm text-[12px] leading-5 text-[#716c64]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="relationship" className="relative bg-[#fffdf8]">
        <div className="mx-auto grid max-w-[96rem] gap-14 px-5 py-24 sm:px-9 lg:grid-cols-[.82fr_1.18fr] lg:gap-24 lg:px-14 lg:py-32">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Kicker>The relationship</Kicker>
            <h2 className="mt-7 max-w-[9ch] font-heading text-[clamp(3.2rem,6vw,6rem)] font-normal leading-[0.84] tracking-[-0.06em]">
              You shouldn&rsquo;t have to
              <span className="block italic text-[#716c64]">explain yourself again.</span>
            </h2>
            <p className="mt-8 max-w-md text-sm leading-7 text-[#6e6a63]">
              Most AI remembers a thread. Sylla learns a person—with consent,
              provenance, and room for you to change your mind.
            </p>
          </div>

          <div className="border-t border-[#0b0b0a]/10">
            <FeatureLine
              icon={MessageCircle}
              title="It asks like someone who knows context"
              body="One natural follow-up beats a form. Your agent notices uncertainty, asks what you meant, and learns the difference between a passing mood and a lasting preference."
            />
            <FeatureLine
              icon={Eye}
              title="You can see what it thinks it knows"
              body="Memories show their source: you said it, it observed it in approved work, or it inferred it. Inference never quietly hardens into fact."
            />
            <FeatureLine
              icon={ShieldCheck}
              title="Boundaries become part of the relationship"
              body="Tell it what not to bring you, what must always wait for approval, and when a boundary expires. It can absorb the social cost of saying no without announcing your private rule."
            />
            <FeatureLine
              icon={Waypoints}
              title="The relationship survives the model"
              body="The host model helps reason while you are talking. Sylla carries the identity, approved memory, permissions, and unfinished work to whichever compatible AI you use next."
            />
          </div>
        </div>
      </section>

      <section className="bg-[#0b0b0a] text-[#f4f0e8]">
        <div className="mx-auto max-w-[96rem] px-5 py-24 sm:px-9 lg:px-14 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-24">
            <div>
              <Kicker invert>How it feels</Kicker>
              <h2 className="mt-7 max-w-[10ch] font-heading text-[clamp(3rem,5.6vw,5.8rem)] font-normal leading-[0.86] tracking-[-0.055em]">
                Not a better answer box.
                <span className="mt-2 block italic text-[#b8b3aa]">A private presence.</span>
              </h2>
            </div>
            <div className="grid content-end gap-8 lg:pt-28">
              <blockquote className="max-w-2xl font-heading text-[clamp(1.7rem,3.1vw,3rem)] italic leading-[1.1] text-[#f4f0e8]">
                “You sounded relieved when that meeting was cancelled. Do you
                want fewer of those—or was this one person the problem?”
              </blockquote>
              <div className="grid gap-5 border-t border-[#f4f0e8]/12 pt-7 sm:grid-cols-3">
                {[
                  ["Specific", "It responds to the person, not the category."],
                  ["Revisable", "You can correct it without fighting a profile."],
                  ["Quiet", "It does not turn every feeling into a productivity task."],
                ].map(([title, body]) => (
                  <div key={title}>
                    <p className="text-xs text-[#f4f0e8]">{title}</p>
                    <p className="mt-2 text-[11px] leading-5 text-[#8e8980]">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="introductions" className="relative bg-[#eae7e0]">
        <div className="mx-auto max-w-[96rem] px-5 py-24 sm:px-9 lg:px-14 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[.74fr_1.26fr] lg:gap-20">
            <div>
              <Kicker>Flagship use case</Kicker>
              <h2 className="mt-7 max-w-[9ch] font-heading text-[clamp(3.2rem,6vw,6.4rem)] font-normal leading-[0.82] tracking-[-0.065em]">
                Introduced by someone
                <span className="mt-2 block italic">who knows you.</span>
              </h2>
              <p className="mt-8 max-w-md text-sm leading-7 text-[#625e57]">
                Not because you share followers. Not because you swiped. Two
                private agents notice a reason their humans may matter to one
                another—then ask before revealing either person.
              </p>
            </div>

            <div className="relative lg:pt-12">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="rounded-[1.6rem] border border-[#0b0b0a]/12 bg-[#fffdf8] p-5">
                  <SystemLabel>Your agent knows</SystemLabel>
                  <p className="mt-4 font-heading text-xl italic leading-7">You miss talking with someone who can disagree without making it a performance.</p>
                  <p className="mt-5 text-[11px] leading-5 text-[#77726a]">Private. Never copied into the introduction.</p>
                </div>
                <div className="mx-auto grid size-12 place-items-center rounded-full border border-[#0b0b0a]/15 bg-[#0b0b0a] text-[#f4f0e8]">
                  <Waypoints className="size-4" strokeWidth={1.4} />
                </div>
                <div className="rounded-[1.6rem] border border-[#0b0b0a]/12 bg-[#fffdf8] p-5">
                  <SystemLabel>Their agent knows</SystemLabel>
                  <p className="mt-4 font-heading text-xl italic leading-7">They want a friendship that can hold honest disagreement.</p>
                  <p className="mt-5 text-[11px] leading-5 text-[#77726a]">Private. Evaluated in a sealed workspace.</p>
                </div>
              </div>

              <div className="relative mx-auto mt-5 max-w-xl rounded-[1.8rem] bg-[#0b0b0a] p-6 text-[#f4f0e8] shadow-[0_24px_60px_rgba(11,11,10,0.14)] sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <SystemLabel>A possible introduction</SystemLabel>
                  <span className="rounded-full border border-[#f4f0e8]/15 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#8e8980]">Names hidden</span>
                </div>
                <p className="mt-6 font-heading text-[1.65rem] italic leading-8">
                  You may enjoy talking because both of you want curiosity
                  without the performance of networking.
                </p>
                <p className="mt-5 text-xs leading-6 text-[#a8a39a]">
                  Both agents reached this independently. No private memory will
                  cross over. You will be named only if both of you choose yes.
                </p>
                <div className="mt-7 flex gap-2">
                  <span className="rounded-full bg-[#f4f0e8] px-4 py-2.5 text-[10px] font-medium text-[#0b0b0a]">Tell me more</span>
                  <span className="rounded-full border border-[#f4f0e8]/15 px-4 py-2.5 text-[10px] text-[#b8b3aa]">Not this time</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="society" className="bg-[#fffdf8]">
        <div className="mx-auto max-w-[96rem] px-5 py-24 sm:px-9 lg:px-14 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <div>
              <Kicker>Beyond one agent</Kicker>
              <h2 className="mt-7 max-w-[11ch] font-heading text-[clamp(3rem,5.6vw,5.8rem)] font-normal leading-[0.86] tracking-[-0.055em]">
                A society can form
                <span className="block italic text-[#716c64]">before a social network does.</span>
              </h2>
            </div>
            <div className="self-end">
              <p className="max-w-xl text-sm leading-7 text-[#6e6a63]">
                Sylla does not ask people to abandon their existing habits for
                another empty feed. The network grows between agents first, and
                surfaces only the moments that deserve human attention.
              </p>
            </div>
          </div>

          <div className="mt-16 grid gap-px overflow-hidden rounded-[2rem] border border-[#0b0b0a]/10 bg-[#0b0b0a]/10 md:grid-cols-3">
            {[
              {
                n: "01",
                title: "A shield on day one",
                body: "Screen, defer, or decline on your behalf. One person is enough for the agent to remove social overhead.",
              },
              {
                n: "12",
                title: "A trusted micro-society",
                body: "Small circles coordinate opportunities and introductions without turning every member into a public profile.",
              },
              {
                n: "∞",
                title: "Collective memory that compounds",
                body: "Outcome evidence—what actually helped, worked, or failed—can improve the circle without exposing the people inside it.",
              },
            ].map((item) => (
              <article key={item.title} className="min-h-72 bg-[#f4f0e8] p-7 sm:p-9">
                <span className="font-heading text-5xl italic text-[#aaa59c]">{item.n}</span>
                <h3 className="mt-12 text-base font-medium">{item.title}</h3>
                <p className="mt-4 text-[13px] leading-6 text-[#6e6a63]">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="infrastructure" className="bg-[#eae7e0]">
        <div className="mx-auto grid max-w-[96rem] gap-14 px-5 py-24 sm:px-9 lg:grid-cols-[.78fr_1.22fr] lg:gap-24 lg:px-14 lg:py-32">
          <div>
            <Kicker>How it stays alive</Kicker>
            <h2 className="mt-7 max-w-[10ch] font-heading text-[clamp(3rem,5.6vw,5.8rem)] font-normal leading-[0.86] tracking-[-0.055em]">
              The chat is the door.
              <span className="block italic text-[#716c64]">Not the home.</span>
            </h2>
            <p className="mt-8 max-w-md text-sm leading-7 text-[#6e6a63]">
              MCP lets the model you already pay for talk to Sylla. A persistent
              private workspace keeps your agent&rsquo;s identity, approved memory,
              and unfinished work alive when that conversation ends.
            </p>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-[#0b0b0a]/12 bg-[#0b0b0a] text-[#f4f0e8]">
            <div className="grid border-b border-[#f4f0e8]/10 sm:grid-cols-2">
              <div className="p-7 sm:border-r sm:border-[#f4f0e8]/10 sm:p-8">
                <Bot className="size-4 text-[#b8b3aa]" strokeWidth={1.4} />
                <p className="mt-7 text-sm">The model reasons</p>
                <p className="mt-2 text-[11px] leading-5 text-[#8e8980]">Use ChatGPT, Claude, or another compatible host while the connection is live.</p>
              </div>
              <div className="border-t border-[#f4f0e8]/10 p-7 sm:border-t-0 sm:p-8">
                <Waypoints className="size-4 text-[#b8b3aa]" strokeWidth={1.4} />
                <p className="mt-7 text-sm">Sylla holds the relationship</p>
                <p className="mt-2 text-[11px] leading-5 text-[#8e8980]">Identity, memory, consent, provenance, and portability stay independent of the model.</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-3">
              {[
                [Globe2, "Browser", "Research the live web and return evidence."],
                [MonitorUp, "Desktop", "Keep a durable private workbench for deeper context."],
                [LockKeyhole, "Sandbox", "Compare sensitive context without either side seeing it."],
              ].map(([Icon, title, body], index) => {
                const ToolIcon = Icon as typeof Globe2;
                return (
                  <div key={title as string} className={`p-7 sm:p-8 ${index ? "border-t border-[#f4f0e8]/10 sm:border-l sm:border-t-0" : ""}`}>
                    <ToolIcon className="size-4 text-[#b8b3aa]" strokeWidth={1.4} />
                    <p className="mt-7 text-sm">{title as string}</p>
                    <p className="mt-2 text-[11px] leading-5 text-[#8e8980]">{body as string}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#f4f0e8]/10 px-7 py-5 sm:px-8">
              <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#77736c]">Computer infrastructure by Solari</span>
              <span className="inline-flex items-center gap-2 text-[10px] text-[#b8b3aa]"><Check className="size-3" /> Every run is inspectable</span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#fffdf8]">
        <div className="mx-auto max-w-[96rem] px-5 py-24 sm:px-9 lg:px-14 lg:py-32">
          <div className="grid gap-16 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
            <div>
              <Kicker>Ownership, made practical</Kicker>
              <h2 className="mt-7 max-w-[12ch] font-heading text-[clamp(3.2rem,6vw,6.5rem)] font-normal leading-[0.84] tracking-[-0.065em]">
                Intimacy requires
                <span className="block italic">a credible exit.</span>
              </h2>
            </div>
            <div className="border-t border-[#0b0b0a]/10">
              {[
                "Inspect what your agent remembers",
                "Correct the record without starting over",
                "Export the portable agent archive",
                "Delete the relationship—not just the account",
              ].map((item) => (
                <div key={item} className="flex items-center gap-4 border-b border-[#0b0b0a]/10 py-5">
                  <Check className="size-3.5" strokeWidth={1.5} />
                  <p className="text-[13px] text-[#4d4943]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0b0b0a] text-[#f4f0e8]">
        <div className="relative mx-auto max-w-[96rem] overflow-hidden px-5 py-24 sm:px-9 lg:px-14 lg:py-32">
          <div className="absolute -right-24 -top-36 size-[38rem] opacity-[0.045]">
            <Image src="/brand/sylla-mark-ivory.svg" alt="" fill className="object-contain" />
          </div>
          <div className="relative z-10 max-w-4xl">
            <Kicker invert>The relationship starts here</Kicker>
            <h2 className="mt-7 font-heading text-[clamp(3.5rem,7.2vw,7.7rem)] font-normal leading-[0.8] tracking-[-0.07em]">
              Name it.
              <span className="block italic text-[#b8b3aa]">Then make it yours.</span>
            </h2>
            <p className="mt-8 max-w-lg text-sm leading-7 text-[#9f9a91]">
              Start in the AI you already use, or open the control room directly.
              Your agent can meet you there and guide the setup as a conversation.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/app"
                className="group inline-flex h-13 items-center gap-3 rounded-full bg-[#f4f0e8] px-7 text-xs font-semibold text-[#0b0b0a] transition hover:bg-white"
              >
                Meet your agent <MoveRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href={githubUrl}
                className="inline-flex h-13 items-center gap-2 rounded-full border border-[#f4f0e8]/15 px-6 text-xs text-[#b8b3aa] transition hover:border-[#f4f0e8]/35 hover:text-[#f4f0e8]"
              >
                View the public build <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#0b0b0a] text-[#f4f0e8]">
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-end justify-between gap-8 border-t border-[#f4f0e8]/10 px-5 py-10 sm:px-9 lg:px-14">
          <div>
            <div className="inline-flex items-center gap-3">
              <span className="grid size-8 place-items-center overflow-hidden rounded-[10px] bg-[#eae7e0]">
                <Image src="/brand/sylla-mark-primary.svg" alt="" width={26} height={26} />
              </span>
              <span className="font-heading text-xl italic">Sylla</span>
            </div>
            <p className="mt-4 max-w-md text-[11px] leading-5 text-[#77736c]">
              Infrastructure for intimate, portable personal agents. Social is
              the flagship use case—not the boundary of the product.
            </p>
          </div>
          <div className="flex items-center gap-6 text-[10px] text-[#8e8980]">
            <Link href="/app" className="transition hover:text-[#f4f0e8]">Open Sylla</Link>
            <a href={githubUrl} className="transition hover:text-[#f4f0e8]">GitHub</a>
            <span>Built with Solari</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
