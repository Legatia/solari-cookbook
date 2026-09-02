import { createHash, randomBytes } from "node:crypto";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function cookieFrom(response: Response, name: string) {
  const setCookie = response.headers.get("set-cookie");
  const match = setCookie?.match(new RegExp(`(?:^|,\\s*)(${name}=[^;]+)`));
  invariant(match?.[1], `Sylla did not issue the ${name} cookie.`);
  return match[1];
}

async function json<T>(response: Response, expectedStatus = 200) {
  if (response.status !== expectedStatus) {
    throw new Error(`Expected HTTP ${expectedStatus}, received ${response.status}.`);
  }
  return (await response.json()) as T;
}

async function callMcp(
  endpoint: string,
  token: string,
  id: number,
  method: string,
  params: Record<string, unknown>,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  invariant(response.ok, `Authenticated MCP call failed with HTTP ${response.status}.`);
  const body = await response.text();
  const payload = response.headers.get("content-type")?.includes("text/event-stream")
    ? body
        .split("\n")
        .findLast((line) => line.startsWith("data: "))
        ?.slice("data: ".length)
    : body;
  invariant(payload, "MCP returned an empty response.");
  const parsed = JSON.parse(payload) as {
    error?: unknown;
    result?: Record<string, unknown>;
  };
  invariant(!parsed.error, `MCP returned an error for ${method}.`);
  return parsed.result ?? {};
}

const baseUrl = new URL(
  process.argv[2] ?? "https://serendipity-kappa.vercel.app",
).origin;
const mcpEndpoint = `${baseUrl}/mcp`;
const gatePassword = process.env.SYLLA_DEMO_PASSWORD;
const verifyLiveResearch = process.env.SYLLA_VERIFY_LIVE_RESEARCH === "true";
let cookie: string | null = null;
let accessToken: string | null = null;

try {
  const protectedMetadata = await json<{
    resource: string;
    authorization_servers: string[];
  }>(await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`));
  invariant(protectedMetadata.resource === mcpEndpoint, "MCP resource metadata is inconsistent.");
  invariant(
    protectedMetadata.authorization_servers.includes(baseUrl),
    "The Sylla authorization server is not advertised.",
  );

  const serverMetadata = await json<{
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint: string;
    code_challenge_methods_supported: string[];
  }>(await fetch(`${baseUrl}/.well-known/oauth-authorization-server`));
  invariant(
    serverMetadata.code_challenge_methods_supported.includes("S256"),
    "The authorization server does not advertise S256 PKCE.",
  );

  const registration = await json<{
    client_id: string;
    redirect_uris: string[];
  }>(
    await fetch(serverMetadata.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Sylla live verification",
        redirect_uris: ["http://127.0.0.1/sylla-oauth-callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    }),
    201,
  );

  let accessCookie: string | null = null;
  if (gatePassword) {
    const accessResponse = await fetch(`${baseUrl}/api/access`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual",
      body: new URLSearchParams({ password: gatePassword, next: "/app" }),
    });
    invariant(accessResponse.status === 303, "The demo password was not accepted.");
    accessCookie = cookieFrom(accessResponse, "sylla_demo_access");
  }

  const sessionResponse = await fetch(`${baseUrl}/api/session`, {
    headers: accessCookie ? { cookie: accessCookie } : undefined,
  });
  invariant(sessionResponse.ok, "The Sylla browser session could not be created.");
  const sessionCookie = cookieFrom(sessionResponse, "sylla_session");
  cookie = [accessCookie, sessionCookie].filter(Boolean).join("; ");

  if (verifyLiveResearch) {
    const startsAt = new Date(Date.now() + 60 * 60 * 1_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1_000);
    const consentResponse = await fetch(`${baseUrl}/api/participation`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Sylla live verifier",
        policyVersion: "2026-09-01",
        ageConfirmed: true,
        publicSourceResearch: true,
        privateMemoryStorage: true,
        matchmaking: true,
        hostDataBoundary: true,
        backgroundContinuation: false,
        availability: [
          {
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            timezone: "UTC",
          },
        ],
      }),
    });
    invariant(consentResponse.ok, "The live verification participant could not consent.");
  }

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const authorizeUrl = new URL(serverMetadata.authorization_endpoint);
  authorizeUrl.searchParams.set("client_id", registration.client_id);
  authorizeUrl.searchParams.set("redirect_uri", registration.redirect_uris[0]!);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("scope", "sylla:agent");
  authorizeUrl.searchParams.set("resource", mcpEndpoint);
  authorizeUrl.searchParams.set("state", state);

  const consentResponse = await fetch(authorizeUrl, {
    headers: { cookie },
  });
  invariant(consentResponse.ok, "The Sylla OAuth consent screen did not load.");
  invariant(
    (await consentResponse.text()).includes("Connect my agent"),
    "The expected explicit consent action was not rendered.",
  );

  const approvalResponse = await fetch(serverMetadata.authorization_endpoint, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded",
    },
    redirect: "manual",
    body: new URLSearchParams({
      client_id: registration.client_id,
      redirect_uri: registration.redirect_uris[0]!,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "sylla:agent",
      resource: mcpEndpoint,
      state,
      decision: "allow",
    }),
  });
  invariant(approvalResponse.status === 303, "OAuth approval did not return a 303 redirect.");
  const callback = new URL(approvalResponse.headers.get("location") ?? "");
  invariant(callback.searchParams.get("state") === state, "OAuth state was not preserved.");
  const code = callback.searchParams.get("code");
  invariant(code, "OAuth approval did not issue an authorization code.");

  const tokens = await json<{
    access_token: string;
    refresh_token: string;
    token_type: string;
  }>(
    await fetch(serverMetadata.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: registration.client_id,
        redirect_uri: registration.redirect_uris[0]!,
        code,
        code_verifier: verifier,
        resource: mcpEndpoint,
      }),
    }),
  );
  accessToken = tokens.access_token;
  invariant(tokens.token_type === "Bearer", "OAuth did not issue a bearer token.");

  const listed = await callMcp(mcpEndpoint, accessToken, 1, "tools/list", {});
  const tools = listed.tools as Array<{ name: string }>;
  for (const name of [
    "sylla_bootstrap_agent",
    "sylla_get_agent_context",
    "sylla_remember",
    "sylla_research",
    "sylla_find_private_introduction",
  ]) {
    invariant(tools.some((tool) => tool.name === name), `MCP is missing ${name}.`);
  }

  await callMcp(mcpEndpoint, accessToken, 2, "tools/call", {
    name: "sylla_bootstrap_agent",
    arguments: {},
  });
  await callMcp(mcpEndpoint, accessToken, 3, "tools/call", {
    name: "sylla_get_agent_context",
    arguments: { includePending: false },
  });

  if (verifyLiveResearch) {
    const research = await callMcp(mcpEndpoint, accessToken, 4, "tools/call", {
      name: "sylla_research",
      arguments: {
        requestId: `live-research-${randomBytes(12).toString("base64url")}`,
        focus: "Understand what the Solari cookbook provides to builders.",
        sources: [
          {
            url: "https://github.com/solari-sdk/solari-cookbook",
            label: "Solari cookbook",
          },
        ],
        backgroundContinuationAllowed: false,
      },
    });
    const structured = research.structuredContent as
      | { progress?: { completedCount?: number; totalCount?: number } }
      | undefined;
    if (
      structured?.progress?.completedCount !== 1 ||
      structured.progress.totalCount !== 1
    ) {
      throw new Error(
        `The live Solari Browser source did not complete: ${JSON.stringify(research)}`,
      );
    }
  }

  const connection = await json<{ connection: { connected: boolean } }>(
    await fetch(`${baseUrl}/api/mcp/connection`, { headers: { cookie } }),
  );
  invariant(connection.connection.connected, "The browser did not see the live MCP grant.");

  const revoked = await json<{ connection: { connected: boolean } }>(
    await fetch(`${baseUrl}/api/mcp/connection`, {
      method: "DELETE",
      headers: { cookie },
    }),
  );
  invariant(!revoked.connection.connected, "The MCP grant was not revoked.");

  const rejected = await fetch(mcpEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }),
  });
  invariant(rejected.status === 401, "The revoked MCP token was still accepted.");

  console.log(
    `Verified live Sylla OAuth and authenticated MCP at ${mcpEndpoint}: ${tools.length} tools, agent bootstrap/context${verifyLiveResearch ? ", one real Solari Browser source" : ""}, connection visibility, and revocation.`,
  );
} finally {
  if (cookie && accessToken) {
    await fetch(`${baseUrl}/api/mcp/connection`, {
      method: "DELETE",
      headers: { cookie },
    }).catch(() => undefined);
  }
  if (cookie && verifyLiveResearch) {
    await fetch(`${baseUrl}/api/participation`, {
      method: "DELETE",
      headers: { cookie },
    }).catch(() => undefined);
  }
}
