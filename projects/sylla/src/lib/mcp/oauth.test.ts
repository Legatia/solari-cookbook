import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { describe, expect, it } from "vitest";

import {
  createSyllaOAuthTokenVerifier,
  getProtectedResourceMetadata,
  getSyllaOAuthConfiguration,
} from "./oauth";

const configuration = {
  issuer: "https://identity.sylla.test/",
  jwksUrl: "https://identity.sylla.test/.well-known/jwks.json",
  audience: "https://sylla.test/mcp",
  resourceMetadataUrl:
    "https://sylla.test/.well-known/oauth-protected-resource/mcp",
};

async function signedToken(audience = configuration.audience) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keyId = "sylla-test-key";
  const keyResolver = createLocalJWKSet({
    keys: [{ ...jwk, kid: keyId, alg: "RS256", use: "sig" }],
  });
  const token = await new SignJWT({
    client_id: "chatgpt-test-client",
    scope: "openid sylla:agent",
    email: "person@example.com",
    name: "Test Person",
  })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(configuration.issuer)
    .setAudience(audience)
    .setSubject("sylla-user-subject")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  return { token, keyResolver };
}

describe("Sylla OAuth resource server", () => {
  it("derives the path-aware protected-resource URL", () => {
    expect(
      getSyllaOAuthConfiguration({
        APP_BASE_URL: "https://sylla.test",
        SYLLA_OAUTH_ISSUER: configuration.issuer,
        SYLLA_OAUTH_JWKS_URL: configuration.jwksUrl,
      }),
    ).toEqual(configuration);
  });

  it("publishes the external authorization server and Sylla scope", () => {
    expect(getProtectedResourceMetadata(configuration)).toEqual({
      resource: configuration.audience,
      authorization_servers: [configuration.issuer],
      scopes_supported: ["sylla:agent"],
      bearer_methods_supported: ["header"],
      resource_name: "Sylla personal agent",
    });
  });

  it("accepts only issuer- and audience-bound JWT access tokens", async () => {
    const { token, keyResolver } = await signedToken();
    const verifier = createSyllaOAuthTokenVerifier(configuration, keyResolver);
    const auth = await verifier.verifyAccessToken(token);

    expect(auth).toMatchObject({
      clientId: "chatgpt-test-client",
      scopes: ["openid", "sylla:agent"],
      extra: {
        issuer: configuration.issuer,
        providerSubject: "sylla-user-subject",
        email: "person@example.com",
        displayName: "Test Person",
      },
    });
  });

  it("rejects a token minted for a different audience", async () => {
    const { token, keyResolver } = await signedToken(
      "https://another-service.test/mcp",
    );
    const verifier = createSyllaOAuthTokenVerifier(configuration, keyResolver);

    await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });
});
