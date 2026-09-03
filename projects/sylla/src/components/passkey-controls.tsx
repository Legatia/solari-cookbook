"use client";

import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { Fingerprint, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type PasskeyStatus = {
  enrolled: boolean;
  count: number;
  credentials: Array<{
    id: string;
    backedUp: boolean;
    deviceType: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
};

async function passkeyRequest<T>(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Passkey request failed.");
  return payload;
}

export function PasskeyLoginButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const options = await passkeyRequest<PublicKeyCredentialRequestOptionsJSON>(
        "/api/auth/passkey/authentication/options",
      );
      const credential = await startAuthentication({ optionsJSON: options });
      await passkeyRequest("/api/auth/passkey/authentication/verify", credential);
      router.push("/app");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Passkey sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        onClick={() => void signIn()}
        disabled={busy}
        className="h-12 w-full rounded-full bg-lime-200 text-xs font-semibold text-stone-950 hover:bg-lime-100"
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <Fingerprint />}
        {busy ? "Opening your passkey…" : "Open my Sylla agent"}
      </Button>
      {error && <p className="mt-3 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}

export function PasskeyAccountPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<PasskeyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/passkey/status")
      .then(async (response) => {
        const payload = (await response.json()) as {
          status?: PasskeyStatus;
          error?: string;
        };
        if (!response.ok || !payload.status) {
          throw new Error(payload.error ?? "Account status failed.");
        }
        if (active) setStatus(payload.status);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Account status failed.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const options = await passkeyRequest<PublicKeyCredentialCreationOptionsJSON>(
        "/api/auth/passkey/registration/options",
      );
      const credential = await startRegistration({ optionsJSON: options });
      const verified = await passkeyRequest<{ status: PasskeyStatus }>(
        "/api/auth/passkey/registration/verify",
        credential,
      );
      setStatus(verified.status);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Passkey setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Sign-out failed.");
      router.push("/login");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-out failed.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[2rem] border border-white/[0.09] bg-white/[0.025] p-6 sm:p-8">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-lime-200/60">
            Account recovery
          </p>
          <h2 className="mt-3 font-heading text-3xl italic text-stone-100">
            Return to the same agent.
          </h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.05] text-lime-200">
          <Fingerprint className="size-4" />
        </span>
      </div>

      <p className="mt-5 max-w-xl text-xs leading-6 text-stone-500">
        A passkey lets this device—or your synced password manager—recover the
        same portable Sylla agent. Sylla stores a public key, never your face,
        fingerprint, or device PIN.
      </p>

      <div className="mt-7 rounded-2xl border border-white/[0.08] bg-black/15 p-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-4 text-lime-200/70" />
          <div>
            <p className="text-xs text-stone-300">
              {status?.enrolled
                ? `${status.count} passkey${status.count === 1 ? "" : "s"} connected`
                : status
                  ? "No recovery passkey yet"
                  : "Checking account security…"}
            </p>
            <p className="mt-1 text-[10px] text-stone-600">
              {status?.credentials[0]?.lastUsedAt
                ? `Last used ${new Date(status.credentials[0].lastUsedAt).toLocaleString()}`
                : "Protected by your device's own verification"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => void enroll()}
          disabled={busy}
          className="rounded-full bg-lime-200 text-xs text-stone-950"
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Fingerprint />}
          {status?.enrolled ? "Add another passkey" : "Create my passkey"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void signOut()}
          disabled={busy}
          className="rounded-full text-xs text-stone-500 hover:text-stone-200"
        >
          <LogOut /> Sign out on this device
        </Button>
      </div>
      {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}
