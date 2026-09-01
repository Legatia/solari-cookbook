import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { z } from "zod";

export const SYLLA_AGENT_SCOPE = "sylla:agent";

const optionalUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.url().optional(),
);

const oauthEnvironmentSchema = z.object({
  APP_BASE_URL: z.url(),
  SYLLA_OAUTH_ISSUER: optionalUrl,
  SYLLA_OAUTH_JWKS_URL: optionalUrl,
  SYLLA_OAUTH_AUDIENCE: optionalUrl,
});

export type SyllaOAuthConfiguration = {
  issuer: string;
  jwksUrl: string;
  audience: string;
  resourceMetadataUrl: string;
};

export function getSyllaOAuthConfiguration(
  values: Record<string, string | undefined> = process.env,
): SyllaOAuthConfiguration | null {
  const environment = oauthEnvironmentSchema.parse(values);

  if (!environment.SYLLA_OAUTH_ISSUER && !environment.SYLLA_OAUTH_JWKS_URL) {
    return null;
  }

  if (!environment.SYLLA_OAUTH_ISSUER || !environment.SYLLA_OAUTH_JWKS_URL) {
    throw new Error(
      "SYLLA_OAUTH_ISSUER and SYLLA_OAUTH_JWKS_URL must be configured together.",
    );
  }

  const audience =
    environment.SYLLA_OAUTH_AUDIENCE ??
    new URL("/mcp", environment.APP_BASE_URL).toString();
  const resourceUrl = new URL(audience);
  const metadataPath = `/.well-known/oauth-protected-resource${resourceUrl.pathname}`;

  return {
    issuer: environment.SYLLA_OAUTH_ISSUER,
    jwksUrl: environment.SYLLA_OAUTH_JWKS_URL,
    audience,
    resourceMetadataUrl: new URL(
      metadataPath,
      environment.APP_BASE_URL,
    ).toString(),
  };
}

function scopesFromPayload(payload: Record<string, unknown>) {
  const scope = payload.scope;
  if (typeof scope === "string") {
    return scope.split(/\s+/).filter(Boolean);
  }

  const scopes = payload.scp;
  return Array.isArray(scopes)
    ? scopes.filter((value): value is string => typeof value === "string")
    : [];
}

function claim(payload: Record<string, unknown>, name: string) {
  const value = payload[name];
  return typeof value === "string" && value ? value : undefined;
}

export function createSyllaOAuthTokenVerifier(
  configuration: SyllaOAuthConfiguration,
  keyResolver: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(configuration.jwksUrl),
  ),
): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const { payload } = await jwtVerify(token, keyResolver, {
          issuer: configuration.issuer,
          audience: configuration.audience,
          algorithms: ["RS256", "ES256", "EdDSA"],
        });
        const subject = claim(payload, "sub");
        const clientId = claim(payload, "client_id") ?? claim(payload, "azp");

        if (!subject || !clientId || !payload.exp) {
          throw new Error(
            "The access token must include sub, client_id or azp, and exp claims.",
          );
        }

        return {
          token,
          clientId,
          scopes: scopesFromPayload(payload),
          expiresAt: payload.exp,
          resource: new URL(configuration.audience),
          extra: {
            issuer: configuration.issuer,
            providerSubject: subject,
            ...(claim(payload, "email")
              ? { email: claim(payload, "email") }
              : {}),
            ...(claim(payload, "name")
              ? { displayName: claim(payload, "name") }
              : {}),
          },
        };
      } catch (error) {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          error instanceof Error ? error.message : "The access token is invalid.",
        );
      }
    },
  };
}

export function getProtectedResourceMetadata(
  configuration: SyllaOAuthConfiguration,
) {
  return {
    resource: configuration.audience,
    authorization_servers: [configuration.issuer],
    scopes_supported: [SYLLA_AGENT_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Sylla personal agent",
  };
}
