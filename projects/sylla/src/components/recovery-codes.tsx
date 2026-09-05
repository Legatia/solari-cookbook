"use client";

import { KeyRound, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type RecoveryStatus = { issued: number; remaining: number };

/**
 * The last way back in, made visible.
 *
 * The codes exist in the response of exactly one request and are never
 * retrievable again, so this panel shows them once and says so plainly rather
 * than implying they can be looked up later.
 */
export function RecoveryCodesPanel() {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/recovery");
        const payload = (await response.json()) as {
          recovery?: RecoveryStatus;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Could not read status.");
        setStatus(payload.recovery ?? null);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not read recovery-code status.",
        );
      } finally {
        setStatusLoaded(true);
      }
    })();
  }, []);

  async function issue() {
    if (
      hasCodes &&
      !window.confirm(
        "Replace your recovery codes? Every code in the current set will stop working immediately.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/auth/recovery", { method: "POST" });
      const payload = (await response.json()) as {
        recovery?: { codes: string[]; count: number };
        error?: string;
      };
      if (!response.ok || !payload.recovery) {
        throw new Error(payload.error ?? "Could not issue recovery codes.");
      }
      setCodes(payload.recovery.codes);
      setStatus({ issued: payload.recovery.count, remaining: payload.recovery.count });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not issue codes.");
    } finally {
      setBusy(false);
    }
  }

  const hasCodes = (status?.remaining ?? 0) > 0;

  return (
    <div className="rounded-[2rem] border border-white/[0.09] bg-white/[0.025] p-6 sm:p-8">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-lime-200/60">
            If you lose every device
          </p>
          <h2 className="mt-3 font-heading text-3xl italic text-stone-100">
            Recovery codes.
          </h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.05] text-lime-200">
          <KeyRound className="size-4" />
        </span>
      </div>

      <p className="mt-5 max-w-xl text-xs leading-6 text-stone-500">
        Sylla holds no email address, so there is no reset link to send you.
        These codes are the only way back to the same agent if your passkey and
        every connected AI host are gone. Print them or keep them somewhere that
        is not the device you sign in from.
      </p>

      <div className="mt-7 rounded-2xl border border-white/[0.08] bg-black/15 p-4">
        <p className="text-xs text-stone-300">
          {!statusLoaded
            ? "Checking recovery codes…"
            : status
            ? hasCodes
              ? `${status.remaining} of ${status.issued} codes unused`
              : status.issued > 0
                ? "All recovery codes have been used"
                : "No recovery codes yet"
            : "Recovery-code status is unavailable"}
        </p>
        <p className="mt-1 text-[10px] text-stone-600">
          Each code works once. Generating a new set cancels the old one.
        </p>
      </div>

      {codes && (
        <div className="mt-5 rounded-2xl border border-lime-200/20 bg-lime-200/[0.04] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-lime-200/70">
            Shown once — save them now
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs text-stone-200">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard
                .writeText(codes.join("\n"))
                .then(() => setCopied(true))
                .catch(() => setError("Copy the codes manually — clipboard was blocked."));
            }}
            className="mt-4 rounded-full text-[11px] text-lime-200/80 hover:text-lime-100"
          >
            {copied ? "Copied" : "Copy all"}
          </Button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => void issue()}
          disabled={busy || !statusLoaded}
          className="rounded-full bg-lime-200 text-xs text-stone-950"
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          {hasCodes ? "Replace my codes" : "Generate recovery codes"}
        </Button>
      </div>
      {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}

/**
 * The redeem side, shown on the sign-in page.
 *
 * Collapsed by default: someone holding a passkey should not be nudged toward
 * the weaker credential, but someone who has lost everything needs to find this
 * without contacting anyone.
 */
export function RecoveryRedeemPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/recovery", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "That code is not usable.");
      router.push("/app");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That code is not usable.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left text-[11px] text-stone-600 underline-offset-4 hover:text-stone-300 hover:underline"
      >
        Lost your passkey and every connected AI? Use a recovery code.
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.09] bg-white/[0.02] p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-lime-200/60">
        Recovery code
      </p>
      <input
        value={code}
        onChange={(changed) => setCode(changed.target.value)}
        onKeyDown={(pressed) => {
          if (pressed.key === "Enter" && code.trim()) void redeem();
        }}
        placeholder="XXXX-XXXX-XXXX"
        autoComplete="one-time-code"
        spellCheck={false}
        className="mt-3 w-full rounded-xl border border-white/[0.1] bg-black/25 px-3 py-2.5 font-mono text-sm tracking-[0.12em] text-stone-100 outline-none placeholder:text-stone-700 focus:border-lime-200/40"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void redeem()}
          disabled={busy || !code.trim()}
          className="rounded-full bg-lime-200 text-xs text-stone-950"
        >
          {busy && <LoaderCircle className="animate-spin" />}
          Sign in with this code
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-stone-600 hover:text-stone-300"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-3 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}
