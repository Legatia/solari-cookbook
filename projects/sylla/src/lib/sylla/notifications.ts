import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDatabase } from "@/db";
import { emailContacts } from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import { recordAuditEvent } from "@/lib/sylla/participation";

/**
 * When Sylla is allowed to reach out, and what it may say.
 *
 * One rule governs every message, and it is the reason this can exist at all:
 * an email says *that* something happened and never *what*. No dossier line, no
 * subject's name, no claim, no evidence — a notification is a knock on the door,
 * and the door is the control room.
 *
 * That is not squeamishness. Mail lands on somebody else's server and stays
 * there; a product whose entire promise is that private material stays put
 * cannot post that material to Gmail the moment it becomes interesting.
 *
 * The rest is restraint. Opt in only, never before the address is proved, at
 * most one message a day, and every one carries a way out that needs no
 * password.
 */

const VERIFY_TTL_HOURS = 24;
const QUIET_PERIOD_HOURS = 20;

export class NotificationError extends Error {}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The unsubscribe capability, derived rather than stored.
 *
 * Every message has to carry a working link, including ones sent months ago, so
 * the token cannot be a secret Sylla forgets. Deriving it from the account and
 * the server secret keeps old links valid without keeping a plaintext token
 * anywhere, and it only ever grants one thing: silence.
 */
function unsubscribeTokenFor(userId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new NotificationError("AUTH_SECRET is required before Sylla can send mail.");
  }
  return createHmac("sha256", secret)
    .update(`sylla-unsubscribe:v1:${userId}`)
    .digest("base64url");
}

/** Deliberately permissive; the verification mail is the real check. */
function normalizeAddress(raw: string) {
  const address = raw.trim().toLowerCase();
  if (address.length > 254 || !/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(address)) {
    throw new NotificationError("That does not look like an email address.");
  }
  return address;
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export type ContactState = {
  address: string | null;
  verified: boolean;
  awaitingVerification: boolean;
  notifyWorkFinished: boolean;
  notifyNeedsYou: boolean;
};

export async function getContact(participantId: string): Promise<ContactState> {
  const identity = await ensurePortableIdentity(participantId);
  const [row] = await getDatabase()
    .select()
    .from(emailContacts)
    .where(eq(emailContacts.userId, identity.userId))
    .limit(1);
  if (!row) {
    return {
      address: null,
      verified: false,
      awaitingVerification: false,
      notifyWorkFinished: true,
      notifyNeedsYou: true,
    };
  }
  return {
    address: row.address,
    verified: Boolean(row.verifiedAt),
    awaitingVerification: !row.verifiedAt,
    notifyWorkFinished: row.notifyWorkFinished,
    notifyNeedsYou: row.notifyNeedsYou,
  };
}

/**
 * Record an address and produce the link that proves it.
 *
 * Returns the verification URL rather than sending it, so the decision to put
 * a secret in an email is made in one place and is testable without a provider.
 */
export async function startEmailVerification(participantId: string, rawAddress: string) {
  const address = normalizeAddress(rawAddress);
  const identity = await ensurePortableIdentity(participantId);
  const database = getDatabase();

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1_000);

  await database
    .insert(emailContacts)
    .values({
      userId: identity.userId,
      address,
      verificationTokenHash: hash(token),
      verificationExpiresAt: expiresAt,
      unsubscribeTokenHash: hash(unsubscribeTokenFor(identity.userId)),
    })
    .onConflictDoUpdate({
      target: emailContacts.userId,
      set: {
        address,
        // Changing the address un-verifies it. Otherwise proving one address
        // would let someone quietly redirect the mail to another.
        verifiedAt: null,
        verificationTokenHash: hash(token),
        verificationExpiresAt: expiresAt,
        updatedAt: new Date(),
      },
    });

  await recordAuditEvent({
    participantId,
    actorType: "participant",
    action: "email_contact.verification_started",
    entityType: "sylla_user",
    entityId: identity.userId,
    metadata: {},
  });

  return {
    address,
    verifyUrl: `${appBaseUrl()}/api/notifications/verify?token=${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/** Prove the address. Single use, and the token dies with it. */
export async function confirmEmailVerification(token: string) {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    throw new NotificationError("That verification link is not valid.");
  }
  const database = getDatabase();
  const candidate = hash(token);
  const [row] = await database
    .select()
    .from(emailContacts)
    .where(eq(emailContacts.verificationTokenHash, candidate))
    .limit(1);
  if (!row || !row.verificationExpiresAt || row.verificationExpiresAt <= new Date()) {
    throw new NotificationError("That verification link has expired.");
  }
  const supplied = Buffer.from(candidate);
  const stored = Buffer.from(row.verificationTokenHash ?? "");
  if (supplied.length !== stored.length || !timingSafeEqual(supplied, stored)) {
    throw new NotificationError("That verification link is not valid.");
  }

  const [confirmed] = await database
    .update(emailContacts)
    .set({
      verifiedAt: new Date(),
      verificationTokenHash: null,
      verificationExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailContacts.id, row.id),
        isNotNull(emailContacts.verificationTokenHash),
      ),
    )
    .returning({ address: emailContacts.address });
  if (!confirmed) throw new NotificationError("That link has already been used.");
  return { verified: true, address: confirmed.address };
}

export async function updatePreferences(
  participantId: string,
  input: { notifyWorkFinished?: boolean; notifyNeedsYou?: boolean },
) {
  const identity = await ensurePortableIdentity(participantId);
  await getDatabase()
    .update(emailContacts)
    .set({
      ...(input.notifyWorkFinished === undefined
        ? {}
        : { notifyWorkFinished: input.notifyWorkFinished }),
      ...(input.notifyNeedsYou === undefined
        ? {}
        : { notifyNeedsYou: input.notifyNeedsYou }),
      updatedAt: new Date(),
    })
    .where(eq(emailContacts.userId, identity.userId));
  return getContact(participantId);
}

/** Forget the address entirely. */
export async function removeContact(participantId: string) {
  const identity = await ensurePortableIdentity(participantId);
  await getDatabase()
    .delete(emailContacts)
    .where(eq(emailContacts.userId, identity.userId));
  await recordAuditEvent({
    participantId,
    actorType: "participant",
    action: "email_contact.removed",
    entityType: "sylla_user",
    entityId: identity.userId,
    metadata: {},
  });
  return { removed: true };
}

/** Stop everything from a link in a message, with no sign-in. */
export async function unsubscribeByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    throw new NotificationError("That unsubscribe link is not valid.");
  }
  const [stopped] = await getDatabase()
    .update(emailContacts)
    .set({ notifyWorkFinished: false, notifyNeedsYou: false, updatedAt: new Date() })
    .where(eq(emailContacts.unsubscribeTokenHash, hash(token)))
    .returning({ id: emailContacts.id });
  if (!stopped) throw new NotificationError("That unsubscribe link is not valid.");
  return { unsubscribed: true };
}

export type NotificationKind = "work_finished" | "needs_you";

export type Deliverable = {
  address: string;
  subject: string;
  text: string;
  unsubscribeUrl: string;
};

/**
 * Decide whether to reach out, and compose what may be said.
 *
 * Returns null whenever Sylla should stay quiet — unverified, switched off, or
 * still inside the quiet period — so callers never have to know the rules.
 *
 * The body is assembled here, from counts only. Nothing that identifies a
 * person, a firm, or a claim is permitted to reach this function, which is why
 * it takes a number rather than the thing the number counts.
 */
export async function prepareNotification(input: {
  userId: string;
  kind: NotificationKind;
  count: number;
}): Promise<Deliverable | null> {
  if (input.count < 1) return null;
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(emailContacts)
    .where(eq(emailContacts.userId, input.userId))
    .limit(1);
  if (!row || !row.verifiedAt) return null;

  const wanted =
    input.kind === "work_finished" ? row.notifyWorkFinished : row.notifyNeedsYou;
  if (!wanted) return null;

  if (
    row.lastSentAt &&
    Date.now() - row.lastSentAt.getTime() < QUIET_PERIOD_HOURS * 60 * 60 * 1_000
  ) {
    return null;
  }

  const plural = input.count === 1 ? "" : "s";
  const subject =
    input.kind === "work_finished"
      ? `Your agent finished ${input.count} thing${plural}`
      : `${input.count} thing${plural} need${input.count === 1 ? "s" : ""} you`;
  const opening =
    input.kind === "work_finished"
      ? `Your Sylla agent finished ${input.count} piece${plural} of work while you were away.`
      : `${input.count} thing${plural} in your pipeline ${input.count === 1 ? "is" : "are"} waiting on you.`;

  return {
    address: row.address,
    subject,
    // Says that, never what. The detail is behind the door, not in the post.
    text: [
      opening,
      "",
      "What it was stays in Sylla rather than in your inbox:",
      appBaseUrl() + "/app",
      "",
      "To stop these, open Sylla and turn them off, or use the unsubscribe link.",
    ].join("\n"),
    unsubscribeUrl: `${appBaseUrl()}/api/notifications/unsubscribe?token=${unsubscribeTokenFor(row.userId)}`,
  };
}

/** Record that a message went out, which starts the quiet period. */
export async function markNotified(userId: string) {
  await getDatabase()
    .update(emailContacts)
    .set({ lastSentAt: new Date(), updatedAt: new Date() })
    .where(eq(emailContacts.userId, userId));
}
