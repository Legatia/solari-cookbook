"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageSquareLock, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type StartedRequest = {
  userCode: string;
  expiresAt: string;
  pollIntervalSeconds: number;
};

type PollResult =
  | { status: "pending"; expiresAt: string; pollIntervalSeconds: number }
  | { status: "expired" | "denied" | "consumed" }
  | {
      status: "approved";
      agentName: string | null;
      accountName: string | null;
      expiresAt: string;
    };

async function call<T>(path: string, method: "GET" | "POST"): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store" });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Something went wrong.");
  return payload;
}

function remaining(expiresAt: string) {
  const seconds = Math.max(
    0,
    Math.round((new Date(expiresAt).getTime() - Date.now()) / 1_000),
  );
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DeviceLoginPanel() {
  const router = useRouter();
  const [request, setRequest] = useState<StartedRequest | null>(null);
  const [approved, setApproved] = useState<
    { agentName: string | null; accountName: string | null; expiresAt: string } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const reset = useCallback((message: string) => {
    pollingRef.current = false;
    setRequest(null);
    setApproved(null);
    setCountdown(null);
    setError(message);
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    setApproved(null);
    try {
      setRequest(await call<StartedRequest>("/api/auth/device", "POST"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start sign-in.");
    } finally {
      setBusy(false);
    }
  }

  // Poll only reports who approved. Signing in is a separate, explicit step so
  // nobody is dropped into an agent that is not theirs.
  useEffect(() => {
    if (!request || approved) return;
    pollingRef.current = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!pollingRef.current) return;
      try {
        const result = await call<PollResult>("/api/auth/device/poll", "GET");
        if (!pollingRef.current) return;
        if (result.status === "approved") {
          pollingRef.current = false;
          setApproved({
            agentName: result.agentName,
            accountName: result.accountName,
            expiresAt: result.expiresAt,
          });
          return;
        }
        if (result.status !== "pending") {
          reset(
            result.status === "denied"
              ? "That sign-in request was declined."
              : "That sign-in request expired. Start a new one.",
          );
          return;
        }
        setCountdown(remaining(result.expiresAt));
        timer = setTimeout(
          () => void tick(),
          result.pollIntervalSeconds * 1_000,
        );
      } catch (caught) {
        reset(caught instanceof Error ? caught.message : "Sign-in check failed.");
      }
    };

    timer = setTimeout(() => void tick(), request.pollIntervalSeconds * 1_000);
    return () => {
      pollingRef.current = false;
      clearTimeout(timer);
    };
  }, [request, approved, reset]);

  // The approval window is deliberately short, so the panel counts it down and
  // clears itself rather than leaving a stale "Continue" button on screen.
  useEffect(() => {
    if (!approved) return;
    const tick = () => {
      const left = new Date(approved.expiresAt).getTime() - Date.now();
      if (left <= 0) {
        reset("That approval expired before it was confirmed. Start a new one.");
        return;
      }
      setCountdown(`0:${String(Math.ceil(left / 1_000)).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [approved, reset]);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await call("/api/auth/device/redeem", "POST");
      router.push("/app");
      router.refresh();
    } catch (caught) {
      reset(caught instanceof Error ? caught.message : "Could not complete sign-in.");
    } finally {
      setBusy(false);
    }
  }

  if (approved) {
    const name = approved.agentName ?? approved.accountName ?? "your Sylla agent";
    return (
      <div className="rounded-2xl border border-lime-200/25 bg-lime-200/[0.04] p-5">
        <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-lime-200/70">
          <ShieldCheck className="size-3.5" /> Approved
        </p>
        <p className="mt-3 text-sm leading-6 text-stone-300">
          An AI host approved this browser for{" "}
          <span className="text-stone-100">{name}</span>. Continue only if that is
          your agent.
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-stone-600">
          Expires in {countdown ?? "0:40"}
        </p>
        <Button
          type="button"
          onClick={() => void finish()}
          disabled={busy}
          className="mt-4 h-11 w-full rounded-full bg-lime-200 text-xs font-semibold text-stone-950 hover:bg-lime-100"
        >
          {busy && <LoaderCircle className="animate-spin" />}
          {busy ? "Opening…" : `Continue as ${name}`}
        </Button>
        <button
          type="button"
          onClick={() => reset("Sign-in cancelled.")}
          className="mt-3 w-full text-[10px] uppercase tracking-[0.16em] text-stone-600 hover:text-stone-400"
        >
          This is not my agent
        </button>
      </div>
    );
  }

  if (request) {
    return (
      <div className="rounded-2xl border border-white/[0.09] bg-white/[0.02] p-5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
          Say this to your AI
        </p>
        <p className="mt-3 font-mono text-3xl tracking-[0.2em] text-lime-200">
          {request.userCode}
        </p>
        <p className="mt-4 text-xs leading-6 text-stone-500">
          In a chat where Sylla is already connected, say{" "}
          <span className="text-stone-300">
            “Approve my Sylla sign-in code {request.userCode}.”
          </span>{" "}
          Your agent will read back this browser and location before approving.
        </p>
        <p className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-stone-600">
          <LoaderCircle className="size-3 animate-spin" /> Waiting
          {countdown ? ` · expires in ${countdown}` : ""}
        </p>
        {error && <p className="mt-3 text-xs leading-5 text-red-300/80">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        onClick={() => void start()}
        disabled={busy}
        className="h-12 w-full rounded-full border-white/[0.12] bg-transparent text-xs font-semibold text-stone-300 hover:bg-white/[0.04]"
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <MessageSquareLock />}
        {busy ? "Generating a code…" : "Approve from my AI instead"}
      </Button>
      {error && <p className="mt-3 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}
