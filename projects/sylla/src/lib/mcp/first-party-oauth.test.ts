import { createHash, randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDatabase } from "@/db";
import { events, oauthClients, participants } from "@/db/schema";

import {
  createFirstPartyAuthorizationCode,
  exchangeFirstPartyAuthorizationCode,
  firstPartyOAuthConfiguration,
  refreshFirstPartyAccessToken,
  registerFirstPartyOAuthClient,
  validateFirstPartyAuthorizationRequest,
  verifyFirstPartyAccessToken,
} from "./first-party-oauth";

const testNodeEnv = process.env.NODE_ENV;
Object.assign(process.env, { NODE_ENV: "development" });
loadEnvConfig(process.cwd(), true, console, true);
Object.assign(process.env, { NODE_ENV: testNodeEnv });

const previousBaseUrl = process.env.APP_BASE_URL;
const eventId = randomUUID();
const participantId = randomUUID();
const eventSlug = `oauth-test-${randomUUID()}`;
let clientId = "";

beforeAll(async () => {
  process.env.APP_BASE_URL = "https://sylla.test";
  await getDatabase().insert(events).values({
    id: eventId,
    slug: eventSlug,
    name: "OAuth test event",
    status: "open",
  });
  await getDatabase().insert(participants).values({
    id: participantId,
    eventId,
    inviteTokenHash: createHash("sha256")
      .update(`oauth-test:${participantId}`)
      .digest("hex"),
  });
});

afterAll(async () => {
  await getDatabase().delete(events).where(eq(events.id, eventId));
  if (clientId) {
    await getDatabase().delete(oauthClients).where(eq(oauthClients.clientId, clientId));
  }
  if (previousBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = previousBaseUrl;
});

describe("first-party Sylla OAuth", () => {
  it("registers a PKCE client, exchanges a one-time code, and rotates refresh tokens", async () => {
    const client = await registerFirstPartyOAuthClient({
      client_name: "ChatGPT test",
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    clientId = client.client_id;
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const configuration = firstPartyOAuthConfiguration();
    const authorizationUrl = new URL(configuration.authorizationEndpoint);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", client.redirect_uris[0]!);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("code_challenge", challenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("scope", "sylla:agent");
    authorizationUrl.searchParams.set("resource", configuration.resource);

    const authorization = await validateFirstPartyAuthorizationRequest(
      authorizationUrl,
    );
    const code = await createFirstPartyAuthorizationCode(
      participantId,
      authorization,
    );
    const firstTokens = await exchangeFirstPartyAuthorizationCode({
      code,
      clientId,
      redirectUri: client.redirect_uris[0]!,
      codeVerifier: verifier,
      resource: configuration.resource,
    });
    const verified = await verifyFirstPartyAccessToken(firstTokens.access_token);
    expect(verified).toMatchObject({ participantId, clientId });

    await expect(
      exchangeFirstPartyAuthorizationCode({
        code,
        clientId,
        redirectUri: client.redirect_uris[0]!,
        codeVerifier: verifier,
        resource: configuration.resource,
      }),
    ).rejects.toThrow();

    const refreshed = await refreshFirstPartyAccessToken({
      refreshToken: firstTokens.refresh_token,
      clientId,
      resource: configuration.resource,
    });
    expect(await verifyFirstPartyAccessToken(firstTokens.access_token)).toBeNull();
    expect(await verifyFirstPartyAccessToken(refreshed.access_token)).toMatchObject({
      participantId,
      clientId,
    });
  });
});
