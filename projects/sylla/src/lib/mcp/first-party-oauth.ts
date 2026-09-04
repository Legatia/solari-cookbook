import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";
import * as z from "zod/v4";

import { getDatabase } from "@/db";
import {
  oauthAccessTokens,
  oauthAuthorizationCodes,
  oauthClients,
} from "@/db/schema";
import { SYLLA_AGENT_SCOPE } from "@/lib/mcp/oauth";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90;
const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;

const registrationSchema = z
  .object({
    redirect_uris: z.array(z.url()).min(1).max(10),
    client_name: z.string().trim().min(1).max(160).optional(),
    grant_types: z
      .array(z.string())
      .default(["authorization_code", "refresh_token"]),
    response_types: z.array(z.string()).default(["code"]),
    token_endpoint_auth_method: z.literal("none").default("none"),
  })
  .passthrough();

export type FirstPartyAuthorizationRequest = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  responseType: "code";
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  resource: string;
  scopes: string[];
};

function baseUrl() {
  const value = process.env.APP_BASE_URL;
  if (!value) throw new Error("APP_BASE_URL is required for Sylla OAuth.");
  return new URL(value).origin;
}

export function firstPartyOAuthConfiguration() {
  const issuer = baseUrl();
  return {
    issuer,
    resource: `${issuer}/mcp`,
    metadataUrl: `${issuer}/.well-known/oauth-protected-resource/mcp`,
    authorizationEndpoint: `${issuer}/oauth/authorize`,
    tokenEndpoint: `${issuer}/oauth/token`,
    registrationEndpoint: `${issuer}/oauth/register`,
  };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function opaque(prefix: string) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function isAllowedRedirectUri(value: string) {
  const url = new URL(value);
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

function requestedScopes(scope: string | null) {
  const scopes = (scope ?? SYLLA_AGENT_SCOPE).split(/\s+/).filter(Boolean);
  const supported = new Set([SYLLA_AGENT_SCOPE]);
  if (!scopes.includes(SYLLA_AGENT_SCOPE)) scopes.push(SYLLA_AGENT_SCOPE);
  if (scopes.some((value) => !supported.has(value))) {
    throw new Error("The request includes an unsupported Sylla scope.");
  }
  return [...new Set(scopes)];
}

export async function registerFirstPartyOAuthClient(input: unknown) {
  const parsed = registrationSchema.parse(input);
  if (!parsed.grant_types.includes("authorization_code")) {
    throw new Error("Sylla requires the authorization_code grant.");
  }
  if (!parsed.response_types.includes("code")) {
    throw new Error("Sylla requires the code response type.");
  }
  if (parsed.redirect_uris.some((uri) => !isAllowedRedirectUri(uri))) {
    throw new Error("Redirect URIs must use HTTPS or a loopback HTTP address.");
  }

  const clientId = opaque("sylla_client_");
  await getDatabase().insert(oauthClients).values({
    clientId,
    clientName: parsed.client_name,
    redirectUris: parsed.redirect_uris,
    grantTypes: parsed.grant_types,
    responseTypes: parsed.response_types,
    tokenEndpointAuthMethod: parsed.token_endpoint_auth_method,
  });

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1_000),
    client_name: parsed.client_name ?? "Sylla MCP client",
    redirect_uris: parsed.redirect_uris,
    grant_types: parsed.grant_types,
    response_types: parsed.response_types,
    token_endpoint_auth_method: "none" as const,
  };
}

export async function validateFirstPartyAuthorizationRequest(
  url: URL,
): Promise<FirstPartyAuthorizationRequest> {
  const configuration = firstPartyOAuthConfiguration();
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const responseType = url.searchParams.get("response_type") ?? "";
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "";
  const resource = url.searchParams.get("resource") ?? configuration.resource;

  const [client] = await getDatabase()
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);

  if (!client || !client.redirectUris.includes(redirectUri)) {
    throw new Error("This MCP client or redirect URI is not registered.");
  }
  if (responseType !== "code") {
    throw new Error("Sylla supports only the OAuth code response type.");
  }
  if (codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    throw new Error("Sylla requires a valid S256 PKCE challenge.");
  }
  if (resource !== configuration.resource) {
    throw new Error("The OAuth resource must be the canonical Sylla MCP URL.");
  }

  return {
    clientId,
    clientName: client.clientName ?? "your AI",
    redirectUri,
    responseType: "code",
    state: url.searchParams.get("state"),
    codeChallenge,
    codeChallengeMethod: "S256",
    resource,
    scopes: requestedScopes(url.searchParams.get("scope")),
  };
}

export async function createFirstPartyAuthorizationCode(
  participantId: string,
  request: FirstPartyAuthorizationRequest,
) {
  const code = opaque("sylla_code_");
  await getDatabase().insert(oauthAuthorizationCodes).values({
    codeHash: hash(code),
    participantId,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    scopes: request.scopes,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1_000),
  });
  return code;
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function issueTokens(input: {
  participantId: string;
  clientId: string;
  resource: string;
  scopes: string[];
}) {
  const accessToken = opaque("sylla_at_");
  const refreshToken = opaque("sylla_rt_");
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1_000);
  const refreshExpiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1_000,
  );
  await getDatabase().insert(oauthAccessTokens).values({
    accessTokenHash: hash(accessToken),
    refreshTokenHash: hash(refreshToken),
    participantId: input.participantId,
    clientId: input.clientId,
    resource: input.resource,
    scopes: input.scopes,
    expiresAt,
    refreshExpiresAt,
  });
  return {
    access_token: accessToken,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: input.scopes.join(" "),
  };
}

export async function exchangeFirstPartyAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string;
}) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) {
    throw new Error("The PKCE verifier is invalid.");
  }
  const now = new Date();
  const [authorizationCode] = await getDatabase()
    .select()
    .from(oauthAuthorizationCodes)
    .where(
      and(
        eq(oauthAuthorizationCodes.codeHash, hash(input.code)),
        eq(oauthAuthorizationCodes.clientId, input.clientId),
        eq(oauthAuthorizationCodes.redirectUri, input.redirectUri),
        eq(oauthAuthorizationCodes.resource, input.resource),
        isNull(oauthAuthorizationCodes.usedAt),
        gt(oauthAuthorizationCodes.expiresAt, now),
      ),
    )
    .limit(1);
  if (
    !authorizationCode ||
    pkceChallenge(input.codeVerifier) !== authorizationCode.codeChallenge
  ) {
    throw new Error("The authorization code or PKCE verifier is invalid.");
  }

  const [claimed] = await getDatabase()
    .update(oauthAuthorizationCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(oauthAuthorizationCodes.id, authorizationCode.id),
        isNull(oauthAuthorizationCodes.usedAt),
      ),
    )
    .returning();
  if (!claimed) throw new Error("The authorization code was already used.");

  return issueTokens({
    participantId: authorizationCode.participantId,
    clientId: authorizationCode.clientId,
    resource: authorizationCode.resource,
    scopes: authorizationCode.scopes,
  });
}

export async function refreshFirstPartyAccessToken(input: {
  refreshToken: string;
  clientId: string;
  resource: string;
}) {
  const now = new Date();
  const [existing] = await getDatabase()
    .select()
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.refreshTokenHash, hash(input.refreshToken)),
        eq(oauthAccessTokens.clientId, input.clientId),
        eq(oauthAccessTokens.resource, input.resource),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.refreshExpiresAt, now),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("The refresh token is invalid or expired.");

  const [revoked] = await getDatabase()
    .update(oauthAccessTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(oauthAccessTokens.id, existing.id),
        isNull(oauthAccessTokens.revokedAt),
      ),
    )
    .returning();
  if (!revoked) throw new Error("The refresh token was already used.");

  return issueTokens({
    participantId: existing.participantId,
    clientId: existing.clientId,
    resource: existing.resource,
    scopes: existing.scopes,
  });
}

export async function verifyFirstPartyAccessToken(token: string) {
  if (!token.startsWith("sylla_at_")) return null;
  const now = new Date();
  const [stored] = await getDatabase()
    .select()
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.accessTokenHash, hash(token)),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.expiresAt, now),
      ),
    )
    .limit(1);
  if (!stored || !stored.scopes.includes(SYLLA_AGENT_SCOPE)) return null;
  await getDatabase()
    .update(oauthAccessTokens)
    .set({ lastUsedAt: now })
    .where(eq(oauthAccessTokens.id, stored.id));
  return stored;
}

export async function getParticipantConnectionSummary(participantId: string) {
  const active = await getDatabase()
    .select({ id: oauthAccessTokens.id, lastUsedAt: oauthAccessTokens.lastUsedAt })
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.participantId, participantId),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.refreshExpiresAt, new Date()),
      ),
    );
  return {
    endpoint: firstPartyOAuthConfiguration().resource,
    connected: active.length > 0,
    connectionCount: active.length,
    lastUsedAt:
      active
        .map((item) => item.lastUsedAt)
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0]
        ?.toISOString() ?? null,
  };
}

export type ConnectedClient = {
  clientId: string;
  clientName: string | null;
  connections: number;
  lastUsedAt: string | null;
  connectedAt: string;
};

/**
 * Which AI clients are connected to this agent, one row each.
 *
 * The summary above answers "is anything connected"; this answers "what, and
 * can I cut that one off". A participant who connected ChatGPT and Claude and
 * now wants only one of them should not have to disconnect both.
 */
export async function listParticipantConnections(
  participantId: string,
): Promise<ConnectedClient[]> {
  const rows = await getDatabase()
    .select({
      clientId: oauthAccessTokens.clientId,
      clientName: oauthClients.clientName,
      lastUsedAt: oauthAccessTokens.lastUsedAt,
      createdAt: oauthAccessTokens.createdAt,
    })
    .from(oauthAccessTokens)
    .leftJoin(oauthClients, eq(oauthClients.clientId, oauthAccessTokens.clientId))
    .where(
      and(
        eq(oauthAccessTokens.participantId, participantId),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.refreshExpiresAt, new Date()),
      ),
    );

  // One row per client, not per token: a host that reconnected five times is
  // still one thing the participant recognizes.
  const byClient = new Map<string, ConnectedClient>();
  for (const row of rows) {
    const existing = byClient.get(row.clientId);
    const lastUsed = row.lastUsedAt?.toISOString() ?? null;
    const connectedAt = row.createdAt.toISOString();
    if (!existing) {
      byClient.set(row.clientId, {
        clientId: row.clientId,
        clientName: row.clientName ?? null,
        connections: 1,
        lastUsedAt: lastUsed,
        connectedAt,
      });
      continue;
    }
    existing.connections += 1;
    if (lastUsed && (!existing.lastUsedAt || lastUsed > existing.lastUsedAt)) {
      existing.lastUsedAt = lastUsed;
    }
    if (connectedAt < existing.connectedAt) existing.connectedAt = connectedAt;
  }
  return [...byClient.values()].sort((a, b) =>
    (b.lastUsedAt ?? b.connectedAt).localeCompare(a.lastUsedAt ?? a.connectedAt),
  );
}

/**
 * Disconnect one AI client. Takes effect on its next request, since every
 * token check refuses a revoked row.
 */
export async function revokeParticipantConnection(
  participantId: string,
  clientId: string,
) {
  const revoked = await getDatabase()
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(oauthAccessTokens.participantId, participantId),
        eq(oauthAccessTokens.clientId, clientId),
        isNull(oauthAccessTokens.revokedAt),
      ),
    )
    .returning({ id: oauthAccessTokens.id });
  return { revoked: revoked.length };
}

export async function revokeParticipantOAuthTokens(participantId: string) {
  await getDatabase()
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(oauthAccessTokens.participantId, participantId),
        isNull(oauthAccessTokens.revokedAt),
      ),
    );
}
