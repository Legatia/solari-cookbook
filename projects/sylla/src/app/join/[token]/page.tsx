import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { AcceptInvitation } from "@/components/join-circle";
import {
  InvitationUnavailableError,
  previewInvitation,
} from "@/lib/sylla/invitations";

export const metadata: Metadata = {
  title: "You have been invited — Sylla",
  description: "Take your seat and start your own portable Sylla agent.",
};

export const dynamic = "force-dynamic";

export default async function JoinPage(context: PageProps<"/join/[token]">) {
  const { token } = await context.params;
  let preview;
  try {
    preview = await previewInvitation(token);
  } catch (error) {
    const message =
      error instanceof InvitationUnavailableError
        ? error.message
        : "This invitation could not be opened.";
    return (
      <Shell>
        <h1 className="mt-10 font-heading text-[clamp(2.4rem,7vw,3.4rem)] leading-[0.95] tracking-[-0.04em] text-stone-100">
          This invitation is closed.
        </h1>
        <p className="mt-6 text-sm leading-7 text-stone-500">{message}</p>
        <p className="mt-4 text-xs leading-6 text-stone-600">
          Ask whoever invited you for a new link — each one is limited on
          purpose.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="mt-10 text-[10px] uppercase tracking-[0.22em] text-lime-200/60">
        {preview.eventName}
      </p>
      <h1 className="mt-4 font-heading text-[clamp(2.6rem,8vw,4rem)] leading-[0.92] tracking-[-0.05em] text-stone-100">
        You have a seat.
      </h1>
      <p className="mt-6 max-w-md text-sm leading-7 text-stone-500">
        Sylla gives you an agent that is yours — it remembers only what you
        approve, it goes with you between AI apps, and no one else can read it.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-6">
        <div>
          <dt className="text-[9px] uppercase tracking-[0.18em] text-stone-600">
            Seats left
          </dt>
          <dd className="mt-2 font-heading text-2xl text-stone-100">
            {preview.seatsRemaining}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-[0.18em] text-stone-600">
            Invitation closes
          </dt>
          <dd className="mt-2 text-xs leading-5 text-stone-300">
            {preview.expiresAt
              ? new Date(preview.expiresAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                })
              : "When the seats run out"}
          </dd>
        </div>
      </dl>

      <AcceptInvitation credential={token} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
        {children}
      </section>
    </main>
  );
}
