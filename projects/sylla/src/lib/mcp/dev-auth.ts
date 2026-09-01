import { timingSafeEqual } from "node:crypto";

import type { AuthInfo } from "@modelcontextprotocol/server";

function equalSecret(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function unauthorized(message: string, status = 401) {
  return Response.json(
    { error: "unauthorized", error_description: message },
    {
      status,
      headers: {
        "WWW-Authenticate": 'Bearer realm="sylla-mcp"',
      },
    },
  );
}

export function authenticateDevelopmentMcpRequest(
  request: Request,
): AuthInfo | Response {
  if (process.env.SYLLA_ENABLE_DEV_MCP !== "true") {
    return unauthorized(
      "The developer MCP bridge is disabled. Production OAuth is not configured yet.",
      503,
    );
  }

  const expectedToken = process.env.SYLLA_MCP_DEV_TOKEN;
  const participantId = process.env.SYLLA_MCP_DEV_PARTICIPANT_ID;

  if (!expectedToken || !participantId) {
    return unauthorized("The developer MCP bridge is not fully configured.", 503);
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token || !equalSecret(token, expectedToken)) {
    return unauthorized("A valid Sylla developer bearer token is required.");
  }

  return {
    token,
    clientId: "sylla-development-client",
    scopes: ["sylla:agent:read", "sylla:agent:write"],
    expiresAt: Math.floor(Date.now() / 1000) + 5 * 60,
    resource: new URL(request.url),
    extra: { participantId },
  };
}
