import { createHmac, timingSafeEqual } from "node:crypto";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type Base64URLString,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db";
import {
  passkeyCredentials,
  personalAgents,
  syllaUsers,
} from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";

const CHALLENGE_COOKIE = "sylla_passkey_challenge";
const CHALLENGE_MAX_AGE_SECONDS = 5 * 60;

type ChallengePurpose = "registration" | "authentication";
type ChallengePayload = {
  challenge: string;
  purpose: ChallengePurpose;
  userId?: string;
  expiresAt: number;
};

function configuration() {
  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const origin = new URL(appUrl).origin;
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for passkey challenges.");
  return { origin, rpId: new URL(origin).hostname, secret };
}

function sealChallenge(payload: ChallengePayload) {
  const { secret } = configuration();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function openChallenge(token: string | undefined, purpose: ChallengePurpose) {
  if (!token) throw new Error("The passkey challenge is missing or expired.");
  const [body, suppliedSignature] = token.split(".");
  if (!body || !suppliedSignature) throw new Error("The passkey challenge is invalid.");
  const { secret } = configuration();
  const expectedSignature = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("The passkey challenge is invalid.");
  }
  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as ChallengePayload;
  if (payload.purpose !== purpose || payload.expiresAt < Date.now()) {
    throw new Error("The passkey challenge is missing or expired.");
  }
  return payload;
}

export function attachPasskeyChallenge<T extends NextResponse>(
  response: T,
  payload: Omit<ChallengePayload, "expiresAt">,
) {
  response.cookies.set(
    CHALLENGE_COOKIE,
    sealChallenge({
      ...payload,
      expiresAt: Date.now() + CHALLENGE_MAX_AGE_SECONDS * 1_000,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: CHALLENGE_MAX_AGE_SECONDS,
      path: "/api/auth/passkey",
    },
  );
  return response;
}

export function readPasskeyChallenge(
  request: NextRequest,
  purpose: ChallengePurpose,
) {
  return openChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, purpose);
}

export function clearPasskeyChallenge<T extends NextResponse>(response: T) {
  response.cookies.set(CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: new Date(0),
    path: "/api/auth/passkey",
  });
  return response;
}

export async function registrationOptions(participantId: string) {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(participantId);
  const [[user], [agent], credentials] = await Promise.all([
    database
      .select()
      .from(syllaUsers)
      .where(eq(syllaUsers.id, identity.userId))
      .limit(1),
    database
      .select()
      .from(personalAgents)
      .where(eq(personalAgents.id, identity.agentId))
      .limit(1),
    database
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, identity.userId)),
  ]);
  if (!user || !agent) throw new Error("The Sylla account could not be opened.");
  const displayName = user.displayName ?? agent.name ?? "Sylla member";
  const { rpId } = configuration();
  const options = await generateRegistrationOptions({
    rpName: "Sylla",
    rpID: rpId,
    userID: new TextEncoder().encode(identity.userId),
    userName: displayName,
    userDisplayName: displayName,
    attestationType: "none",
    excludeCredentials: credentials.map((credential) => ({
      id: credential.credentialId as Base64URLString,
      transports: credential.transports,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  return { options, userId: identity.userId };
}

export async function registerPasskey(input: {
  participantId: string;
  userId: string;
  challenge: string;
  response: RegistrationResponseJSON;
}) {
  const database = getDatabase();
  const identity = await ensurePortableIdentity(input.participantId);
  if (identity.userId !== input.userId) {
    throw new Error("This passkey challenge belongs to another Sylla account.");
  }
  const { origin, rpId } = configuration();
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error("The passkey could not be verified.");
  const { credential } = verification.registrationInfo;
  const [created] = await database
    .insert(passkeyCredentials)
    .values({
      userId: identity.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: input.response.response.transports ?? credential.transports ?? [],
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
    })
    .onConflictDoNothing({ target: passkeyCredentials.credentialId })
    .returning({ id: passkeyCredentials.id });
  if (!created) {
    throw new Error("That passkey is already connected to a Sylla account.");
  }
  return passkeyStatus(input.participantId);
}

export async function authenticationOptions() {
  const { rpId } = configuration();
  return generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials: [],
    userVerification: "required",
  });
}

export async function authenticatePasskey(input: {
  challenge: string;
  response: AuthenticationResponseJSON;
}) {
  const database = getDatabase();
  const [stored] = await database
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.credentialId, input.response.id))
    .limit(1);
  if (!stored) throw new Error("That passkey is not connected to Sylla.");
  const { origin, rpId } = configuration();
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
    credential: {
      id: stored.credentialId as Base64URLString,
      publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
      counter: stored.counter,
      transports: stored.transports,
    },
  });
  if (!verification.verified) throw new Error("The passkey could not be verified.");
  await database
    .update(passkeyCredentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      deviceType: verification.authenticationInfo.credentialDeviceType,
      lastUsedAt: new Date(),
    })
    .where(
      and(
        eq(passkeyCredentials.id, stored.id),
        eq(passkeyCredentials.userId, stored.userId),
      ),
    );
  return { userId: stored.userId };
}

export async function passkeyStatus(participantId: string) {
  const identity = await ensurePortableIdentity(participantId);
  const credentials = await getDatabase()
    .select({
      id: passkeyCredentials.id,
      backedUp: passkeyCredentials.backedUp,
      deviceType: passkeyCredentials.deviceType,
      createdAt: passkeyCredentials.createdAt,
      lastUsedAt: passkeyCredentials.lastUsedAt,
    })
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, identity.userId));
  return {
    enrolled: credentials.length > 0,
    count: credentials.length,
    credentials: credentials.map((credential) => ({
      ...credential,
      createdAt: credential.createdAt.toISOString(),
      lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
    })),
  };
}
