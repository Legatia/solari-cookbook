import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";

import type { SyllaSessionState } from "@/lib/sylla/contracts";

import { createSyllaMcpServer, type SyllaMcpServices } from "./server";

const state: SyllaSessionState = {
  participantId: "5c0a3dd5-4e42-485d-b18e-18ddaf172223",
  identity: {
    userId: "4bdf1501-a75f-4cbb-ab8b-e14748a25f61",
    agentId: "0930f8d2-2753-4a0d-91e1-957091d6f349",
    portable: true,
  },
  agentName: "Mira",
  focus: "Find thoughtful people at a local event.",
  stage: "ready",
  research: { provider: "mock", runReference: "run-1", completedAt: null },
  sources: [],
  observations: [
    {
      id: "3295a3c0-a857-4be3-9a03-bd31d3995045",
      sourceId: null,
      sourceTitle: null,
      sourceUrl: null,
      claim: "Prefers thoughtful conversations over networking theatre.",
      evidenceExcerpt: null,
      origin: "told_to_me",
      status: "confirmed",
      visibility: "private",
      confidence: "high",
    },
    {
      id: "50898735-9d42-4367-81cf-0328447d8647",
      sourceId: null,
      sourceTitle: null,
      sourceUrl: null,
      claim: "Might enjoy meeting designers.",
      evidenceExcerpt: null,
      origin: "inferred",
      status: "pending",
      visibility: "private",
      confidence: "low",
    },
  ],
  workspace: {
    id: "e275e249-bfc0-4cb7-9dbf-12b0de8e2955",
    provider: "solari",
    sessionId: null,
    volumeId: "volume-private",
    snapshotId: "snapshot-1",
    status: "paused",
    lastActiveAt: "2026-09-01T10:00:00.000Z",
    pausedAt: "2026-09-01T10:05:00.000Z",
  },
};

function createTestHandler(services: SyllaMcpServices) {
  return createMcpHandler(
    () => createSyllaMcpServer(state.participantId, services),
  );
}

async function callMcp(
  handler: ReturnType<typeof createTestHandler>,
  body: Record<string, unknown>,
) {
  const response = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );

  const responseText = await response.text();
  const dataLine = responseText
    .split("\n")
    .findLast((line) => line.startsWith("data: "));
  const payload = response.headers
    .get("content-type")
    ?.includes("text/event-stream")
    ? dataLine?.slice("data: ".length)
    : responseText;

  if (!payload) throw new Error("MCP returned an empty response.");

  return {
    response,
    body: JSON.parse(payload) as Record<string, unknown>,
  };
}

describe("Sylla MCP server", () => {
  it("lists the portable agent tools over stateless Streamable HTTP", async () => {
    const services: SyllaMcpServices = {
      bootstrapAgent: vi.fn().mockResolvedValue(state),
      loadState: vi.fn().mockResolvedValue(state),
    };
    const handler = createTestHandler(services);
    const { response, body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "sylla_bootstrap_agent" }),
          expect.objectContaining({ name: "sylla_get_agent_context" }),
          expect.objectContaining({ name: "sylla_get_agent_workspace" }),
        ]),
      },
    });
  });

  it("returns approved memories without leaking pending proposals by default", async () => {
    const services: SyllaMcpServices = {
      bootstrapAgent: vi.fn().mockResolvedValue(state),
      loadState: vi.fn().mockResolvedValue(state),
    };
    const handler = createTestHandler(services);
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "sylla_get_agent_context",
        arguments: {},
      },
    });

    const result = body.result as {
      structuredContent: { memories: Array<{ status: string }> };
    };
    expect(result.structuredContent.memories).toHaveLength(1);
    expect(result.structuredContent.memories[0]?.status).toBe("confirmed");
  });

  it("bootstraps idempotently through the injected portable-agent service", async () => {
    const bootstrapAgent = vi.fn().mockResolvedValue(state);
    const services: SyllaMcpServices = {
      bootstrapAgent,
      loadState: vi.fn().mockResolvedValue(state),
    };
    const handler = createTestHandler(services);
    const { body } = await callMcp(handler, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "sylla_bootstrap_agent",
        arguments: { agentName: "Mira" },
      },
    });

    expect(bootstrapAgent).toHaveBeenCalledWith(state.participantId, {
      agentName: "Mira",
    });
    expect(body).toMatchObject({
      result: {
        structuredContent: {
          agent: {
            agentId: state.identity.agentId,
            portable: true,
            workspaceStatus: "paused",
          },
        },
      },
    });
  });
});
