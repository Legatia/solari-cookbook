import { afterEach, describe, expect, it } from "vitest";

import { authenticateDevelopmentMcpRequest } from "./dev-auth";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("developer MCP authentication", () => {
  it("stays disabled unless explicitly enabled", () => {
    delete process.env.SYLLA_ENABLE_DEV_MCP;

    const auth = authenticateDevelopmentMcpRequest(
      new Request("http://localhost/mcp", { method: "POST" }),
    );

    expect(auth).toBeInstanceOf(Response);
    expect((auth as Response).status).toBe(503);
  });

  it("binds a valid developer token to one participant", () => {
    process.env.SYLLA_ENABLE_DEV_MCP = "true";
    process.env.SYLLA_MCP_DEV_TOKEN = "test-secret";
    process.env.SYLLA_MCP_DEV_PARTICIPANT_ID = stateParticipantId;

    const auth = authenticateDevelopmentMcpRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(auth).not.toBeInstanceOf(Response);
    expect("extra" in auth ? auth.extra : null).toEqual({
      participantId: stateParticipantId,
    });
  });
});

const stateParticipantId = "5c0a3dd5-4e42-485d-b18e-18ddaf172223";
