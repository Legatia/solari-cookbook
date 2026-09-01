import { createMcpHandler } from "@modelcontextprotocol/server";
import type { NextRequest } from "next/server";

import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { createSyllaMcpServer } from "@/lib/mcp/server";
import { resolveAuthenticatedPrincipal } from "@/lib/sylla/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handler = createMcpHandler(
  async ({ authInfo }) => {
    let participantId = authInfo?.extra?.participantId;

    if (
      typeof participantId !== "string" &&
      typeof authInfo?.extra?.issuer === "string" &&
      typeof authInfo.extra.providerSubject === "string"
    ) {
      const principal = await resolveAuthenticatedPrincipal({
        issuer: authInfo.extra.issuer,
        subject: authInfo.extra.providerSubject,
        clientId: authInfo.clientId,
        scopes: authInfo.scopes,
        ...(typeof authInfo.extra.email === "string"
          ? { email: authInfo.extra.email }
          : {}),
        ...(typeof authInfo.extra.displayName === "string"
          ? { displayName: authInfo.extra.displayName }
          : {}),
      });
      participantId = principal.participantId;
    }

    if (typeof participantId !== "string") {
      throw new Error("The MCP request is missing its Sylla participant scope.");
    }

    if (typeof authInfo?.clientId !== "string") {
      throw new Error("The MCP request is missing its authenticated client ID.");
    }

    return createSyllaMcpServer({ participantId, clientId: authInfo.clientId });
  },
  {
    onerror: (error) => console.error("Sylla MCP request failed", error),
  },
);

export async function POST(request: NextRequest) {
  const auth = await authenticateMcpRequest(request);
  if (auth instanceof Response) return auth;

  return handler.fetch(request, { authInfo: auth });
}

export function GET() {
  return Response.json(
    {
      name: "Sylla MCP",
      status: "oauth-resource-server",
      message:
        "Connect with Streamable HTTP POST and an OAuth bearer token scoped to sylla:agent.",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
