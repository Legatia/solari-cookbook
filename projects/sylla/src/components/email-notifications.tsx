"use client";

import { LoaderCircle, Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Contact = {
  address: string | null;
  verified: boolean;
  awaitingVerification: boolean;
  notifyWorkFinished: boolean;
  notifyNeedsYou: boolean;
};

export function EmailNotificationsPanel() {
  const [contact, setContact] = useState<Contact | null>(null);
  const [sendingEnabled, setSendingEnabled] = useState(true);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function load() {
    const response = await fetch("/api/notifications");
    const payload = (await response.json()) as {
      contact?: Contact;
      sendingEnabled?: boolean;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? "Could not load this.");
    setContact(payload.contact ?? null);
    setSendingEnabled(payload.sendingEnabled ?? false);
  }

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch {
        setContact(null);
      }
    })();
  }, []);

  function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await work();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className="rounded-[2rem] border border-white/[0.18] bg-white/[0.05] p-6 sm:p-8">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-lime-200/60">
            Being told
          </p>
          <h2 className="mt-3 font-heading text-3xl italic text-stone-100">
            Email, if you want it.
          </h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.05] text-lime-200">
          <Mail className="size-4" />
        </span>
      </div>

      <p className="mt-5 max-w-xl text-xs leading-6 text-stone-400">
        Sylla holds no address unless you give it one. If you do, it can tell you
        when your agent finishes something or when the pipeline needs you — and
        only that. A message says something happened, never what it was. The
        detail stays here rather than in your inbox.
      </p>

      {!sendingEnabled && (
        <p className="mt-5 rounded-xl border border-amber-200/20 bg-amber-100/[0.04] px-4 py-3 text-[11px] leading-5 text-amber-100/75">
          Mail is not configured on this deployment, so nothing can be sent yet.
        </p>
      )}

      <div className="mt-7 rounded-2xl border border-white/[0.16] bg-black/15 p-4">
        <p className="text-xs text-stone-300">
          {contact === null
            ? "Checking…"
            : contact.verified
              ? `Confirmed — ${contact.address}`
              : contact.awaitingVerification
                ? `Waiting on you to confirm ${contact.address}`
                : "No address on file"}
        </p>
        <p className="mt-1 text-[10px] text-stone-400">
          {contact?.verified
            ? "At most one message a day. Every one has a way out."
            : "Nothing is sent until you open the link Sylla mails you."}
        </p>
      </div>

      {contact?.verified && (
        <div className="mt-5 space-y-2">
          {(
            [
              ["notifyWorkFinished", "When my agent finishes work I was away for"],
              ["notifyNeedsYou", "When something in my pipeline needs me"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.16] bg-black/15 px-4 py-3"
            >
              <input
                type="checkbox"
                checked={contact[key]}
                disabled={busy}
                onChange={(changed) =>
                  run(async () => {
                    const response = await fetch("/api/notifications", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ [key]: changed.target.checked }),
                    });
                    const payload = (await response.json()) as { contact?: Contact };
                    if (!response.ok) throw new Error("Could not save that.");
                    setContact(payload.contact ?? contact);
                  })
                }
                className="size-3.5 accent-lime-200"
              />
              <span className="text-[11px] text-stone-300">{label}</span>
            </label>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={address}
          onChange={(changed) => setAddress(changed.target.value)}
          placeholder={contact?.address ?? "you@example.com"}
          inputMode="email"
          autoComplete="email"
          className="min-w-[12rem] flex-1 rounded-full border border-white/[0.2] bg-black/25 px-4 py-2 text-xs text-stone-100 outline-none placeholder:text-stone-700 focus:border-lime-200/40"
        />
        <Button
          type="button"
          disabled={busy || !address.trim() || !sendingEnabled}
          onClick={() =>
            run(async () => {
              const response = await fetch("/api/notifications", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ address }),
              });
              const payload = (await response.json()) as {
                contact?: Contact;
                error?: string;
              };
              if (!response.ok) throw new Error(payload.error ?? "Could not send it.");
              setContact(payload.contact ?? null);
              setAddress("");
              setSent(true);
            })
          }
          className="rounded-full bg-lime-200 text-xs text-stone-950"
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Mail />}
          {contact?.address ? "Use a different address" : "Send me a confirmation"}
        </Button>
        {contact?.address && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const response = await fetch("/api/notifications", {
                  method: "DELETE",
                });
                const payload = (await response.json()) as { contact?: Contact };
                if (!response.ok) throw new Error("Could not remove it.");
                setContact(payload.contact ?? null);
                setSent(false);
              })
            }
            className="rounded-full text-[11px] text-stone-400 hover:text-stone-200"
          >
            Forget my address
          </Button>
        )}
      </div>

      {sent && !contact?.verified && (
        <p className="mt-4 text-[11px] leading-5 text-lime-200/70">
          Sent. Open the link in that message and Sylla will start telling you.
        </p>
      )}
      {error && <p className="mt-4 text-xs leading-5 text-red-300/80">{error}</p>}
    </div>
  );
}
