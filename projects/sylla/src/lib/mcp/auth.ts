import {
  requireBearerAuth,
  type AuthInfo,
} from "@modelcontextprotocol/server";

import {
  authenticateDevelopmentMcpRequest,
  tryAuthenticateDevelopmentMcpRequest,
} from "./dev-auth";
import {
  firstPartyOAuthConfiguration,
  verifyFirstPartyAccessToken,
} from "./first-party-oauth";
import {
  createSyllaOAuthTokenVerifier,
  getSyllaOAuthConfiguration,
  SYLLA_AGENT_SCOPE,
} from "./oauth";

let cachedOauthGate:
  | ((request: Request) => Promise<AuthInfo | Response>)
  | undefined;
let cachedConfigurationKey: string | undefined;

function firstPartyUnauthorized(message = "A valid Sylla OAuth token is required.") {
  const configuration = firstPartyOAuthConfiguration();
  return Response.json(
    { error: "unauthorized", error_description: message },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer resource_metadata="${configuration.metadataUrl}", scope="${SYLLA_AGENT_SCOPE}"`,
      },
    },
  );
}

export async function authenticateMcpRequest(request: Request) {
  const developmentAuth = tryAuthenticateDevelopmentMcpRequest(request);
  if (developmentAuth) return developmentAuth;

  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token?.startsWith("sylla_at_")) {
    const stored = await verifyFirstPartyAccessToken(token);
    if (!stored) return firstPartyUnauthorized("The Sylla token is invalid or expired.");
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.expiresAt.getTime() / 1_000),
      resource: new URL(stored.resource),
      extra: {
        participantId: stored.participantId,
        issuer: firstPartyOAuthConfiguration().issuer,
      },
    } satisfies AuthInfo;
  }

  const configuration = getSyllaOAuthConfiguration();
  if (!configuration) {
    if (process.env.APP_BASE_URL) return firstPartyUnauthorized();
    return authenticateDevelopmentMcpRequest(request);
  }

  const configurationKey = JSON.stringify(configuration);
  if (!cachedOauthGate || cachedConfigurationKey !== configurationKey) {
    cachedOauthGate = requireBearerAuth({
      verifier: createSyllaOAuthTokenVerifier(configuration),
      requiredScopes: [SYLLA_AGENT_SCOPE],
      resourceMetadataUrl: configuration.resourceMetadataUrl,
    });
    cachedConfigurationKey = configurationKey;
  }

  return cachedOauthGate(request);
}
