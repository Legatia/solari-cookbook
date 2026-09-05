"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

async function join(credential: string) {
  const response = await fetch("/api/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const payload = (await response.json()) as { error?: string; next?: string };
  if (!response.ok) throw new Error(payload.error ?? "This invitation could not be opened.");
  return payload.next ?? "/app";
}

/** The accept button on an invitation that has already been shown to be valid. */
export function AcceptInvitation({ credential }: { credential: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-8">
      <Button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          join(credential)
            .then((next) => {
              router.push(next);
              router.refresh();
            })
            .catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : "Could not join.");
              setBusy(false);
            });
        }}
        className="w-full rounded-full bg-lime-200 py-6 text-xs text-stone-950"
      >
        {busy && <LoaderCircle className="animate-spin" />}
        Take my seat
      </Button>
      {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
      <p className="mt-5 text-[10px] leading-5 text-stone-600">
        Nothing is created until you press this. Your agent is yours, it starts
        empty, and you decide what it is allowed to remember.
      </p>
    </div>
  );
}

/** Code entry, for an invitation that was spoken rather than sent. */
export function EnterInvitationCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setBusy(true);
    setError(null);
    join(code)
      .then((next) => {
        router.push(next);
        router.refresh();
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not join.");
        setBusy(false);
      });
  }

  return (
    <div className="mt-8">
      <input
        value={code}
        onChange={(changed) => setCode(changed.target.value)}
        onKeyDown={(pressed) => {
          if (pressed.key === "Enter" && code.trim()) submit();
        }}
        placeholder="XXXX-XXXX-XXXX"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-xl border border-white/[0.1] bg-black/25 px-4 py-3 text-center font-mono text-base tracking-[0.18em] text-stone-100 outline-none placeholder:text-stone-700 focus:border-lime-200/40"
      />
      <Button
        type="button"
        disabled={busy || !code.trim()}
        onClick={submit}
        className="mt-4 w-full rounded-full bg-lime-200 py-6 text-xs text-stone-950"
      >
        {busy && <LoaderCircle className="animate-spin" />}
        Join with this code
      </Button>
      {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}
