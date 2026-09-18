import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { EnterInvitationCode } from "@/components/join-circle";

export const metadata: Metadata = {
  title: "Enter your invitation — Sylla",
  description: "Join Sylla with the code you were given.",
};

export default function JoinWithCodePage() {
  return (
    <main className="observatory-shell relative grid min-h-svh place-items-center overflow-hidden bg-background px-5 py-10 text-foreground">
      <div className="paper-grid absolute inset-0 opacity-20" />
      <section className="relative w-full max-w-lg rounded-[2rem] border border-white/[0.09] bg-[#101310]/95 p-7 shadow-[0_40px_140px_rgba(0,0,0,0.45)] sm:p-10">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
            Sylla
          </span>
          <ShieldCheck className="size-4 text-lime-200/55" />
        </div>
        <p className="mt-10 text-[10px] uppercase tracking-[0.22em] text-lime-200/60">
          Invitation only
        </p>
        <h1 className="mt-4 font-heading text-[clamp(2.6rem,8vw,4rem)] leading-[0.92] tracking-[-0.05em] text-stone-100">
          Enter your code.
        </h1>
        <p className="mt-6 max-w-md text-sm leading-7 text-stone-500">
          Whoever invited you can read you a twelve-character code, or send you
          a link that does the same thing.
        </p>
        <EnterInvitationCode />
      </section>
    </main>
  );
}
