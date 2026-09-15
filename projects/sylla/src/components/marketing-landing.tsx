import {
  ArrowUpRight,
  BookUser,
  Clock,
  Eye,
  LockKeyhole,
  Moon,
  MoveRight,
  Play,
  ShieldHalf,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

const githubUrl = "https://github.com/Legatia/solari-cookbook";

function Wordmark() {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="Sylla home">
      <span className="relative grid size-8 place-items-center rounded-full border border-[#3F6212]/30 bg-[#D7F0A4]">
        <span className="size-1.5 rounded-full bg-[#3F6212]" />
        <span className="absolute inset-1 rounded-full border border-[#3F6212]/15 transition-transform duration-500 group-hover:rotate-45" />
      </span>
      <span className="font-heading text-xl italic tracking-[-0.03em] text-[#16190F]">
        Sylla
      </span>
    </Link>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.24em] text-[#4A7A12]">
      <span className="h-px w-9 bg-[#3F6212]/45" />
      {children}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  lede?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="relative mx-auto max-w-[92rem] border-t border-[#16190F]/10 px-5 py-20 sm:px-9 lg:px-14 lg:py-28"
    >
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-6 font-heading text-[clamp(2.2rem,4.2vw,3.4rem)] font-normal leading-[0.95] tracking-[-0.045em] text-[#16190F]">
            {title}
          </h2>
          {lede && (
            <p className="mt-6 max-w-md text-sm leading-7 text-[#555B4A]">{lede}</p>
          )}
        </div>
        {children && <div>{children}</div>}
      </div>
    </section>
  );
}

/** A claim with the thing that makes it credible sitting under it. */
function Beat({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof BookUser;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4 border-b border-[#16190F]/8 py-5 last:border-b-0">
      <span className="mt-0.5 shrink-0 text-[#4A7A12]">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm text-[#22261A]">{title}</p>
        <p className="mt-1.5 text-[13px] leading-6 text-[#6B7160]">{body}</p>
      </div>
    </div>
  );
}

/** A worked example, in the shape the product actually renders it. */
function Card({
  label,
  children,
  tone = "plain",
}: {
  label: string;
  children: React.ReactNode;
  tone?: "plain" | "alert" | "good";
}) {
  const edge =
    tone === "alert"
      ? "border-amber-600/25 bg-amber-100/70"
      : tone === "good"
        ? "border-[#3F6212]/25 bg-[#E8F7CC]"
        : "border-[#16190F]/12 bg-white";
  return (
    <div className={`rounded-2xl border p-5 ${edge}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6B7160]">
        {label}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function MarketingLanding() {
  return (
    <main className="marketing-page min-h-svh overflow-hidden bg-[#F6F7F2] text-[#16190F]">
      <nav className="relative z-30 mx-auto flex max-w-[92rem] items-center justify-between px-5 py-6 sm:px-9 lg:px-14">
        <Wordmark />
        <div className="hidden items-center gap-8 text-[11px] text-[#6B7160] md:flex">
          <a href="#book" className="transition-colors hover:text-[#16190F]">The book</a>
          <a href="#slipping" className="transition-colors hover:text-[#16190F]">What&rsquo;s slipping</a>
          <a href="#away" className="transition-colors hover:text-[#16190F]">While you&rsquo;re away</a>
          <a href="#boundaries" className="transition-colors hover:text-[#16190F]">Saying no</a>
          <a href="#circle" className="transition-colors hover:text-[#16190F]">The circle</a>
        </div>
        <Link
          href="/app"
          className="group inline-flex h-9 items-center gap-2 rounded-full border border-[#16190F]/15 bg-white px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-[#3A4030] transition hover:border-[#3F6212]/35 hover:text-[#3F6212]"
        >
          Sign in <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto grid max-w-[92rem] gap-14 px-5 pb-20 pt-10 sm:px-9 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:px-14 lg:pb-24 lg:pt-14">
        <div className="relative z-10 max-w-4xl">
          <div className="marketing-rise">
            <Eyebrow>Invitation only · founders &amp; investors</Eyebrow>
          </div>
          <h1
            className="marketing-rise mt-8 font-heading text-[clamp(2.9rem,6vw,5.4rem)] font-normal leading-[0.86] tracking-[-0.06em]"
            style={{ animationDelay: "100ms" }}
          >
            Your deal book.
            <span className="mt-3 block italic text-[#3F6212]">
              In the AI you already use.
            </span>
          </h1>
          <p
            className="marketing-rise mt-8 max-w-xl text-[15px] leading-7 text-[#555B4A] sm:text-base sm:leading-8"
            style={{ animationDelay: "220ms" }}
          >
            A private agent you run from inside ChatGPT or Claude. It keeps a
            record on everyone you are dealing with, researches them on real
            browsers, and carries on after you close the chat.
          </p>
          <div
            className="marketing-rise mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "320ms" }}
          >
            <a
              href="#book"
              className="group inline-flex h-12 items-center gap-3 rounded-full bg-[#C6EC7A] px-6 text-xs font-semibold text-[#16190F] transition hover:bg-[#D7F58F]"
            >
              See what it does <MoveRight className="size-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href={githubUrl}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-[#16190F]/15 px-6 text-xs text-[#555B4A] transition hover:border-[#3F6212]/35 hover:text-[#3F6212]"
            >
              Read the source <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </div>

        <div className="marketing-rise relative z-10 space-y-3" style={{ animationDelay: "420ms" }}>
          <Card label="Waiting on you" tone="alert">
            <p className="text-sm text-[#16190F]">Index Ventures</p>
            <p className="mt-1 text-xs text-[#6B7160]">
              Due: send the retention cohort
            </p>
          </Card>
          <Card label="Talking · no contact for 21 days">
            <p className="text-sm text-[#16190F]">Mara Ellis</p>
            <p className="mt-1 text-xs text-[#6B7160]">
              Asked how churn splits by cohort
            </p>
          </Card>
          <Card label="Last 30 days" tone="good">
            <p className="text-sm leading-6 text-[#16190F]">
              Nothing irreversible happened while you were away.
            </p>
          </Card>
        </div>
      </section>

      {/* The problem */}
      <Section
        id="problem"
        eyebrow="Why this exists"
        title={
          <>
            Every conversation
            <span className="block italic text-[#6B7160]">starts from nothing.</span>
          </>
        }
        lede="You explain your company, your stage and your terms again. It forgets when the tab closes. And whatever it did learn belongs to whoever made the model."
      >
        <div className="rounded-2xl border border-[#16190F]/12 bg-white p-6 sm:p-8">
          <Beat
            icon={BookUser}
            title="It remembers the people, not just the thread"
            body="Every claim carries where it came from: you said it, it read it in a source you approved, or it worked it out. The weakest kind is labelled the weakest."
          />
          <Beat
            icon={LockKeyhole}
            title="Private to you, and only you"
            body="Your records are never pooled with anyone else's, never used to match you, and never disclosed in an introduction. You can export the lot or delete it in one action."
          />
          <Beat
            icon={Sparkles}
            title="It goes where you go"
            body="Start in ChatGPT, carry on in Claude. The agent is yours rather than the model's, so changing model does not cost you the relationship."
          />
        </div>
      </Section>

      {/* The book */}
      <Section
        id="book"
        eyebrow="The book"
        title={
          <>
            It keeps the book
            <span className="block italic text-[#3F6212]">you keep meaning to keep.</span>
          </>
        }
        lede="A record on every person and firm you deal with, built as you talk. Tell it what happened and it files it — who asked for what, what you promised, where it stands."
      >
        <div className="space-y-3">
          <Card label="Index Ventures · in diligence">
            <ul className="space-y-3">
              <li>
                <p className="text-[13px] leading-6 text-[#22261A]">
                  Asked for two more months of retention before a term sheet.
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#4A7A12]">
                  You told me · 4 Sept
                </p>
              </li>
              <li>
                <p className="text-[13px] leading-6 text-[#22261A]">
                  Led a Series A in a comparable company last year.
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#6B7160]">
                  Read from a source · 4 Sept · awaiting you
                </p>
              </li>
            </ul>
          </Card>
          <p className="px-1 text-[13px] leading-6 text-[#6B7160]">
            Nothing is filed as fact because the agent guessed it. What it worked
            out on its own waits for you to confirm.
          </p>
        </div>
      </Section>

      {/* Triage */}
      <Section
        id="slipping"
        eyebrow="What&rsquo;s slipping"
        title={
          <>
            It opens with
            <span className="block italic text-[#3F6212]">what you have dropped.</span>
          </>
        }
        lede="Not a list of everyone. Three things only: a promise whose date has passed, a conversation gone quiet, and someone you added a week ago and never approached."
      >
        <div className="space-y-3">
          <Card label="Three need you" tone="alert">
            <ul className="space-y-2.5 text-[13px] leading-6">
              <li className="flex items-baseline justify-between gap-4">
                <span className="text-[#22261A]">Index Ventures</span>
                <span className="font-mono text-[10px] text-amber-800">overdue</span>
              </li>
              <li className="flex items-baseline justify-between gap-4">
                <span className="text-[#22261A]">Mara Ellis</span>
                <span className="font-mono text-[10px] text-[#6B7160]">21 days quiet</span>
              </li>
              <li className="flex items-baseline justify-between gap-4">
                <span className="text-[#22261A]">Halden Partners</span>
                <span className="font-mono text-[10px] text-[#6B7160]">never approached</span>
              </li>
            </ul>
          </Card>
          <p className="px-1 text-[13px] leading-6 text-[#6B7160]">
            Silence is read against where things stand. A fortnight without
            contact during diligence is a problem; the same fortnight after they
            passed is not. Nothing is scored, because a number you cannot work
            out by hand is a number you will not trust.
          </p>
        </div>
      </Section>

      {/* Unattended */}
      <Section
        id="away"
        eyebrow="While you&rsquo;re away"
        title={
          <>
            It keeps working
            <span className="block italic text-[#3F6212]">when you don&rsquo;t.</span>
          </>
        }
        lede="Approved research runs on real browsers in the cloud and finishes after the conversation ends. Then it shows you exactly what it did."
      >
        <div className="rounded-2xl border border-[#16190F]/12 bg-white p-6 sm:p-8">
          <Beat
            icon={Moon}
            title="Work that outlives the chat"
            body="Say what you want looked into and close the tab. The work continues, checkpointed, inside the budget you set."
          />
          <Beat
            icon={Play}
            title="Watchable, not just claimed"
            body="Sessions are recorded. Every unattended run shows what it did, what it cost, which model stood in — and offers the replay."
          />
          <Beat
            icon={Eye}
            title="Nothing irreversible, by construction"
            body="The background worker summarises and does not act. That is a property of how it is built rather than a promise about how it behaves."
          />
        </div>
      </Section>

      {/* Boundaries */}
      <Section
        id="boundaries"
        eyebrow="Saying no"
        title={
          <>
            Your agent can decline
            <span className="block italic text-[#3F6212]">on your behalf.</span>
          </>
        }
        lede="Nothing right now. Nothing cold. At most a few a week. Set a boundary and things are turned away before they ever reach you."
      >
        <div className="space-y-3">
          <Card label="In force">
            <div className="flex items-center gap-2.5">
              <ShieldHalf className="size-3.5 text-[#4A7A12]" />
              <p className="text-[13px] text-[#22261A]">
                Only when both agents arrived at it independently
              </p>
            </div>
          </Card>
          <p className="px-1 text-[13px] leading-6 text-[#6B7160]">
            Nobody is told you have a rule — a refusal that announced itself
            would become a signal about you. And you can always see how much was
            turned away, because a boundary you cannot inspect stops being
            protection and becomes an algorithm choosing for you.
          </p>
        </div>
      </Section>

      {/* Second act */}
      <Section
        id="circle"
        eyebrow="The circle"
        title={
          <>
            And when two people
            <span className="block italic text-[#3F6212]">should meet.</span>
          </>
        }
        lede="Both agents work it out first, using what each person allowed. Neither side's private context crosses over, and nobody is named until both say yes."
      >
        <div className="rounded-3xl border border-[#16190F]/12 bg-white p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Clock className="size-4 text-[#4A7A12]" />
            <p className="text-sm text-[#22261A]">Invitation only</p>
          </div>
          <p className="mt-4 text-[13px] leading-7 text-[#6B7160]">
            Sylla is only as good as who is in it, so members vouch for members.
            Each invitation is for one person, and a seat comes back to you when
            someone you brought in settles in.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/join"
              className="group inline-flex h-12 items-center gap-3 rounded-full bg-[#C6EC7A] px-6 text-xs font-semibold text-[#16190F] transition hover:bg-[#D7F58F]"
            >
              I have an invitation <MoveRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/app"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-[#16190F]/15 px-6 text-xs text-[#555B4A] transition hover:border-[#3F6212]/35 hover:text-[#3F6212]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </Section>

      <footer className="mx-auto max-w-[92rem] border-t border-[#16190F]/10 px-5 py-12 sm:px-9 lg:px-14">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Wordmark />
          <p className="max-w-md text-[11px] leading-6 text-[#868C77]">
            A private agent for founders and investors. Yours rather than the
            model&rsquo;s, portable between AI apps, and readable only by you.
          </p>
          <a
            href={githubUrl}
            className="inline-flex items-center gap-2 text-[11px] text-[#6B7160] transition-colors hover:text-[#3F6212]"
          >
            Public repository <ArrowUpRight className="size-3" />
          </a>
        </div>
      </footer>
    </main>
  );
}
