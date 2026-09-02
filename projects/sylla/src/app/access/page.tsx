import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";

import { safeDemoReturnPath } from "@/lib/demo-access";

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeDemoReturnPath(query.next);
  const invalid = query.error === "invalid";

  return (
    <main className="observatory-shell grid min-h-svh place-items-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-md rounded-[2rem] border border-white/[0.09] bg-black/20 p-7 shadow-2xl shadow-black/30 sm:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full border border-lime-200/20 text-lime-200">
              <LockKeyhole className="size-4" />
            </span>
            <div>
              <p className="font-heading text-xl italic text-stone-100">Sylla</p>
              <p className="text-[8px] uppercase tracking-[0.2em] text-stone-500">Private live demo</p>
            </div>
          </div>
          <ShieldCheck className="size-4 text-lime-200/50" />
        </div>

        <h1 className="mt-10 font-heading text-[clamp(3.4rem,12vw,5.5rem)] leading-[0.88] tracking-[-0.05em] text-stone-100">
          Enter the inner circle.
        </h1>
        <p className="mt-6 text-sm leading-7 text-stone-500">
          This build uses real Sylla infrastructure and metered Solari execution. Access is limited while we rehearse it with people we trust.
        </p>

        <form action="/api/access" method="post" className="mt-9">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Demo password</span>
            <input
              required
              autoFocus
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Enter password"
              aria-invalid={invalid}
              className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-stone-100 outline-none transition-colors placeholder:text-stone-700 focus:border-lime-200/35"
            />
          </label>
          {invalid && (
            <p className="mt-3 text-xs text-red-300/80">That password did not open this demo.</p>
          )}
          <button
            type="submit"
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-lime-200 text-xs font-semibold text-stone-950 transition-transform hover:scale-[1.01]"
          >
            Open Sylla <ArrowRight className="size-4" />
          </button>
        </form>

        <p className="mt-7 border-t border-white/[0.07] pt-5 text-[10px] leading-5 text-stone-600">
          The password creates a seven-day HttpOnly access session. Your personal agent and its permissions remain separate.
        </p>
      </section>
    </main>
  );
}
