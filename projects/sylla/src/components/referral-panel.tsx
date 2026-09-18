"use client";

import { Copy, LoaderCircle, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Allowance = {
  granted: number;
  base: number;
  earned: number;
  spent: number;
  remaining: number;
  atCeiling: boolean;
};

type Referral = {
  invitationId: string;
  label: string | null;
  expiresAt: string | null;
  revoked: boolean;
  redeemed: boolean;
  settledIn: boolean;
  who: string | null;
};

type Issued = { url: string; code: string };

function standing(referral: Referral) {
  if (referral.revoked) return "Withdrawn";
  if (referral.settledIn) return `${referral.who ?? "They"} joined`;
  if (referral.redeemed) return "Opened, still setting up";
  if (referral.expiresAt && new Date(referral.expiresAt) < new Date()) {
    return "Expired — seat returned";
  }
  return "Waiting";
}

/**
 * Handing a seat to someone you know.
 *
 * The panel states the rule plainly rather than dressing it as a rewards
 * scheme, because the honest version is more persuasive here: a seat comes back
 * when the person you vouched for decides to stay.
 */
export function ReferralPanel() {
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/invitations");
    const payload = (await response.json()) as {
      allowance?: Allowance;
      referrals?: Referral[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? "Could not load invitations.");
    setAllowance(payload.allowance ?? null);
    setReferrals(payload.referrals ?? []);
  }

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch {
        setAllowance(null);
      }
    })();
  }, []);

  async function issue() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/invitations", { method: "POST" });
      const payload = (await response.json()) as {
        invitation?: Issued;
        allowance?: Allowance;
        error?: string;
      };
      if (!response.ok || !payload.invitation) {
        throw new Error(payload.error ?? "Could not create an invitation.");
      }
      setIssued(payload.invitation);
      setAllowance(payload.allowance ?? null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[2rem] border border-white/[0.18] bg-white/[0.05] p-6 sm:p-8">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-lime-200/60">
            Who you vouch for
          </p>
          <h2 className="mt-3 font-heading text-3xl italic text-stone-100">
            Bring someone in.
          </h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.05] text-lime-200">
          <UserPlus className="size-4" />
        </span>
      </div>

      <p className="mt-5 max-w-xl text-xs leading-6 text-stone-400">
        Sylla only works as well as the people in it. Each invitation is for one
        person and expires in two weeks — and a seat comes back to you when
        someone you invited settles in, so vouching well is what earns more.
      </p>

      <div className="mt-7 rounded-2xl border border-white/[0.16] bg-black/15 p-4">
        <p className="text-xs text-stone-300">
          {allowance
            ? allowance.granted === 0
              ? "Finish your own setup to start inviting"
              : `${allowance.remaining} of ${allowance.granted} seats available`
            : "Checking your seats…"}
        </p>
        {allowance && allowance.earned > 0 && (
          <p className="mt-1 text-[10px] text-stone-400">
            {allowance.base} to start, {allowance.earned} earned back
            {allowance.atCeiling ? " — at the ceiling for now" : ""}
          </p>
        )}
      </div>

      {issued && (
        <div className="mt-5 rounded-2xl border border-lime-200/20 bg-lime-200/[0.04] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-lime-200/70">
            Shown once — send it to one person
          </p>
          <p className="mt-3 break-all font-mono text-[11px] leading-5 text-stone-200">
            {issued.url}
          </p>
          <p className="mt-2 font-mono text-sm tracking-[0.16em] text-stone-100">
            {issued.code}
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard
                .writeText(issued.url)
                .then(() => setCopied(true))
                .catch(() => setError("Copy it manually — the clipboard was blocked."));
            }}
            className="mt-3 rounded-full text-[11px] text-lime-200/80 hover:text-lime-100"
          >
            <Copy /> {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}

      {referrals.length > 0 && (
        <ul className="mt-6 space-y-2 border-t border-white/[0.14] pt-5">
          {referrals.map((referral) => (
            <li
              key={referral.invitationId}
              className="flex items-center justify-between gap-4 text-[11px]"
            >
              <span className="truncate text-stone-400">
                {referral.label ?? "Invitation"}
              </span>
              <span
                className={
                  referral.settledIn ? "text-lime-200/80" : "text-stone-400"
                }
              >
                {standing(referral)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Button
          type="button"
          onClick={() => void issue()}
          disabled={busy || allowance?.remaining === 0}
          className="rounded-full bg-lime-200 text-xs text-stone-950"
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
          Create an invitation
        </Button>
      </div>
      {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}
