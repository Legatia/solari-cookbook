import { describe, expect, it, vi } from "vitest";

import {
  createConfiguredInternalModelAdapter,
  createDeterministicInternalModelAdapter,
  createOpenAiInternalModelAdapter,
  InternalModelConfigurationError,
  InternalModelResponseError,
} from "./internal-model";

const checkpoint = {
  summary: "The host collected one approved source.",
  completedActions: ["Collected approved source"],
  nextAction: "Ask the participant to review it",
  evidenceRefs: ["source-1"],
};

describe("Sylla internal fallback model", () => {
  it("uses a deterministic, non-consequential adapter by default", async () => {
    const adapter = createConfiguredInternalModelAdapter({});
    const output = await adapter.generateReconnectHandoff({
      purpose: "Preserve a host checkpoint",
      checkpoint,
    });

    expect(output).toMatchObject({
      provider: "sylla-deterministic",
      model: null,
      nextAction: checkpoint.nextAction,
      deterministicRecoveryUsed: true,
    });
    expect(output.summary).toContain(checkpoint.summary);
  });

  it("asks for no reasoning, because a handoff restates rather than decides", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ summary: "Restated.", nextAction: null }),
              },
            ],
          },
        ],
      }),
    );
    const adapter = createOpenAiInternalModelAdapter({
      apiKey: "key",
      model: "gpt-5.6-luna",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await adapter.generateReconnectHandoff({ purpose: "Preserve", checkpoint });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.reasoning).toEqual({ effort: "none" });
    // No deliberation requested, so no deliberation budget is bought.
    expect(body.max_output_tokens).toBe(220);
  });

  it("buys headroom when a model is asked to deliberate", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ summary: "Restated.", nextAction: null }),
              },
            ],
          },
        ],
      }),
    );
    const adapter = createOpenAiInternalModelAdapter({
      apiKey: "key",
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await adapter.generateReconnectHandoff({ purpose: "Preserve", checkpoint });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.reasoning).toEqual({ effort: "low" });
    // Reasoning is billed out of the same budget as the answer, so asking for
    // it without raising the cap spends the whole allowance before any text.
    expect(body.max_output_tokens).toBeGreaterThan(220);
  });

  it("omits the reasoning field for a model that has no such parameter", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ summary: "Restated.", nextAction: null }),
              },
            ],
          },
        ],
      }),
    );
    const adapter = createOpenAiInternalModelAdapter({
      apiKey: "key",
      model: "gpt-4o",
      reasoningEffort: "default",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await adapter.generateReconnectHandoff({ purpose: "Preserve", checkpoint });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty("reasoning");
  });

  it("says how to fix a truncation instead of only naming it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
      }),
    );
    const adapter = createOpenAiInternalModelAdapter({
      apiKey: "key",
      model: "gpt-5.6-luna",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      adapter.generateReconnectHandoff({ purpose: "Preserve", checkpoint }),
    ).rejects.toThrow(/SYLLA_INTERNAL_MODEL_REASONING_EFFORT/);
  });

  it("sends only bounded explicit state to the live Responses API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "The approved checkpoint is ready to review.",
                  nextAction: "Review the source",
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 90, output_tokens: 24 },
      }),
    );
    const adapter = createOpenAiInternalModelAdapter({
      apiKey: "test-api-key",
      model: "test-model",
      fetchImpl,
    });

    const output = await adapter.generateReconnectHandoff({
      purpose: "Preserve a host checkpoint",
      checkpoint,
    });
    expect(output).toMatchObject({
      provider: "openai",
      model: "test-model",
      inputTokens: 90,
      outputTokens: 24,
      deterministicRecoveryUsed: false,
    });

    const [url, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(body).toMatchObject({
      model: "test-model",
      max_output_tokens: 220,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "sylla_reconnect_handoff",
          strict: true,
        },
      },
    });
    expect(JSON.stringify(body)).toContain("source-1");
    expect(JSON.stringify(body)).not.toContain("test-api-key");
  });

  it("rejects missing live configuration and invalid output", async () => {
    expect(() =>
      createConfiguredInternalModelAdapter({
        SYLLA_INTERNAL_MODEL_MODE: "live",
      }),
    ).toThrow(InternalModelConfigurationError);

    const adapter = createOpenAiInternalModelAdapter({
      apiKey: "test-api-key",
      model: "test-model",
      fetchImpl: vi.fn().mockResolvedValue(
        Response.json({ status: "completed", output: [], usage: null }),
      ),
    });
    await expect(
      adapter.generateReconnectHandoff({ purpose: "test", checkpoint: null }),
    ).rejects.toBeInstanceOf(InternalModelResponseError);
  });

  it("can be selected explicitly without network access", () => {
    expect(createDeterministicInternalModelAdapter().provider).toBe(
      "sylla-deterministic",
    );
  });
});
