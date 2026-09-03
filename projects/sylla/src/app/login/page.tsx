import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { PasskeyLoginButton } from "@/components/passkey-controls";

export const metadata: Metadata = {
  title: "Return to your agent — Sylla",
  description: "Sign in with a passkey and open your private Sylla control room.",
};

export default function LoginPage() {
  return (
    <main className="observatory-shell relative grid min-h-svh place-items-center overflow-hidden bg-background px-5 py-10 text-foreground">
      <div className="paper-grid absolute inset-0 opacity-20" />
      <section className="relative w-full max-w-lg rounded-[2rem] border border-white/[0.09] bg-[#101310]/95 p-7 shadow-[0_40px_140px_rgba(0,0,0,0.45)] sm:p-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-stone-500 hover:text-lime-200"
          >
            <ArrowLeft className="size-3.5" /> Sylla
          </Link>
          <ShieldCheck className="size-4 text-lime-200/55" />
        </div>

        <p className="mt-12 text-[10px] uppercase tracking-[0.22em] text-lime-200/60">
          Your private control room
        </p>
        <h1 className="mt-4 font-heading text-[clamp(3.4rem,11vw,5.5rem)] leading-[0.88] tracking-[-0.055em] text-stone-100">
          Pick up where you left off.
        </h1>
        <p className="mt-6 max-w-md text-sm leading-7 text-stone-500">
          Your agent, approved memories, evidence, permissions, and connected AI
          hosts are waiting behind your passkey.
        </p>

        <div className="mt-9">
          <PasskeyLoginButton />
        </div>
        <p className="mt-7 border-t border-white/[0.07] pt-5 text-[10px] leading-5 text-stone-600">
          New here? Connect Sylla from your AI or open a valid invitation first.
          You can create a recovery passkey from the control room afterward.
        </p>
      </section>
    </main>
  );
}
