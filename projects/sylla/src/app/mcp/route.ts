import { createMcpHandler } from "@modelcontextprotocol/server";
import type { NextRequest } from "next/server";

import { authenticateDevelopmentMcpRequest } from "@/lib/mcp/dev-auth";
import { createSyllaMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handler = createMcpHandler(
  ({ authInfo }) => {
    const participantId = authInfo?.extra?.participantId;

    if (typeof participantId !== "string") {
      throw new Error("The MCP request is missing its Sylla participant scope.");
    }

    return createSyllaMcpServer(participantId);
  },
  {
    onerror: (error) => console.error("Sylla MCP request failed", error),
  },
);

export async function POST(request: NextRequest) {
  const auth = authenticateDevelopmentMcpRequest(request);
  if (auth instanceof Response) return auth;

  return handler.fetch(request, { authInfo: auth });
}

export function GET() {
  return Response.json(
    {
      name: "Sylla MCP",
      status: "developer-auth-only",
      message: "Connect with Streamable HTTP POST and a configured bearer token.",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
