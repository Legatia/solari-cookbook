import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COMPATIBLE_PRESETS,
  ModelKeyError,
  PROVIDER_DEFAULTS,
  verifyModelKey,
} from "./model-keys";
import {
  createAnthropicInternalModelAdapter,
  createOpenAiCompatibleInternalModelAdapter,
} from "./internal-model";

const originalSecret = process.env.MODEL_KEY_SECRET;

describe("model key verification", () => {
  beforeEach(() => {
    process.env.MODEL_KEY_SECRET = "a-long-enough-test-secret-value";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.MODEL_KEY_SECRET;
    else process.env.MODEL_KEY_SECRET = originalSecret;
  });

  it("sends an Anthropic key as x-api-key with a version header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await verifyModelKey({ provider: "anthropic", apiKey: "sk-ant-test", fetchImpl: fetchImpl as never });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/models");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers.authorization).toBeUndefined();
  });

  it("sends an OpenAI key as a bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await verifyModelKey({ provider: "openai", apiKey: "sk-test", fetchImpl: fetchImpl as never });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
  });

  it("reports a rejected key distinctly from an unreachable provider", async () => {
    const rejected = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    await expect(
      verifyModelKey({ provider: "anthropic", apiKey: "sk-ant-bad", fetchImpl: rejected as never }),
    ).rejects.toThrow(/rejected that key/);

    const unreachable = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(
      verifyModelKey({ provider: "anthropic", apiKey: "sk-ant-test", fetchImpl: unreachable as never }),
    ).rejects.toThrow(/could not be reached/);
  });

  it("defaults each provider to a current model", () => {
    expect(PROVIDER_DEFAULTS.anthropic.defaultModel).toBe("claude-opus-5");
    expect(PROVIDER_DEFAULTS.anthropic.prefixHint).toBe("sk-ant-");
  });
});

describe("anthropic fallback adapter", () => {
  const checkpoint = {
    purpose: "Resume approved source research",
    checkpoint: {
      summary: "Read two of three approved sources.",
      completedActions: ["source one", "source two"],
      nextAction: "Read the third approved source",
      evidenceRefs: ["ref-1"],
    },
  };

  it("bounds the request and asks for a low-effort summary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: '{"summary":"Two of three sources read.","nextAction":"Read the third."}',
            },
          ],
          usage: { input_tokens: 120, output_tokens: 30 },
        }),
        { status: 200 },
      ),
    );
    const adapter = createAnthropicInternalModelAdapter({
      apiKey: "sk-ant-test",
      model: "claude-opus-5",
      fetchImpl: fetchImpl as never,
    });
    const result = await adapter.generateReconnectHandoff(checkpoint);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.max_tokens).toBe(220);
    expect(body.output_config).toEqual({ effort: "low" });
    // budget_tokens is rejected on current models; it must never be sent.
    expect(body).not.toHaveProperty("budget_tokens");
    expect(body).not.toHaveProperty("thinking");

    expect(result.provider).toBe("anthropic");
    expect(result.summary).toBe("Two of three sources read.");
    expect(result.deterministicRecoveryUsed).toBe(false);
  });

  it("treats a refusal as a failure rather than a handoff", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ stop_reason: "refusal", content: [] }), {
        status: 200,
      }),
    );
    const adapter = createAnthropicInternalModelAdapter({
      apiKey: "sk-ant-test",
      model: "claude-opus-5",
      fetchImpl: fetchImpl as never,
    });
    await expect(adapter.generateReconnectHandoff(checkpoint)).rejects.toThrow(
      /refused/,
    );
  });

  it("refuses to construct without a key or model", () => {
    expect(() =>
      createAnthropicInternalModelAdapter({ apiKey: "", model: "claude-opus-5" }),
    ).toThrow();
    expect(
      () => createAnthropicInternalModelAdapter({ apiKey: "sk-ant-test", model: "" }),
    ).toThrow();
  });
});

describe("model key errors", () => {
  it("is distinguishable for the API layer", () => {
    expect(new ModelKeyError("x")).toBeInstanceOf(Error);
  });
});

describe("openai-compatible providers", () => {
  it("refuses an unreviewed endpoint before a credential-bearing fetch", async () => {
    const fetchImpl = vi.fn();
    await expect(
      verifyModelKey({
        provider: "openai_compatible",
        apiKey: "sk-test-key-value",
        baseUrl: "https://metadata.evil.example",
        model: "some-model",
        fetchImpl: fetchImpl as never,
      }),
    ).rejects.toThrow(/reviewed provider endpoints/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses query-bearing variants of an otherwise reviewed endpoint", async () => {
    await expect(
      verifyModelKey({
        provider: "openai_compatible",
        apiKey: "sk-test-key-value",
        baseUrl: "https://api.deepseek.com/v1?redirect=elsewhere",
        model: "deepseek-chat",
        fetchImpl: vi.fn() as never,
      }),
    ).rejects.toThrow(/reviewed provider endpoints/);
  });

  it("refuses to follow a redirect, since the key travels with the request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 302 }));
    await expect(
      verifyModelKey({
        provider: "openai_compatible",
        apiKey: "sk-test-key-value",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        fetchImpl: fetchImpl as never,
      }),
    ).rejects.toThrow(/redirect/);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe("manual");
  });

  it("probes a compatible endpoint with a one-token completion", async () => {
    // /models is inconsistently implemented across these providers, so the
    // check exercises the exact path the fallback will use.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await verifyModelKey({
      provider: "openai_compatible",
      apiKey: "sk-deepseek-test",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      fetchImpl: fetchImpl as never,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string).max_tokens).toBe(1);
  });

  it("explains a 404 as a base-url problem rather than a bad key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(
      verifyModelKey({
        provider: "openai_compatible",
        apiKey: "sk-test-key-value",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        fetchImpl: fetchImpl as never,
      }),
    ).rejects.toThrow(/base URL/);
  });

  it("calls chat/completions rather than OpenAI's responses endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content:
                  '```json\n{"summary":"Two sources read.","nextAction":null}\n```',
              },
            },
          ],
          usage: { prompt_tokens: 90, completion_tokens: 20 },
        }),
        { status: 200 },
      ),
    );
    const adapter = createOpenAiCompatibleInternalModelAdapter({
      apiKey: "sk-qwen-test",
      model: "qwen-plus",
      baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/",
      fetchImpl: fetchImpl as never,
    });
    const result = await adapter.generateReconnectHandoff({
      purpose: "Resume approved source research",
      checkpoint: {
        summary: "Read two of three approved sources.",
        completedActions: ["one", "two"],
        nextAction: null,
        evidenceRefs: [],
      },
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    // The trailing slash on the configured base URL must not double up.
    expect(url).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.max_tokens).toBe(220);
    expect(body.response_format).toEqual({ type: "json_object" });
    // A fenced reply is still parsed rather than failing the handoff.
    expect(result.summary).toBe("Two sources read.");
    expect(result.nextAction).toBeNull();
    expect(result.provider).toBe("openai_compatible");
  });

  it("treats a content filter as a refusal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ finish_reason: "content_filter" }] }),
        { status: 200 },
      ),
    );
    const adapter = createOpenAiCompatibleInternalModelAdapter({
      apiKey: "sk-test-key-value",
      model: "some-model",
      baseUrl: "https://api.example.com/v1",
      fetchImpl: fetchImpl as never,
    });
    await expect(
      adapter.generateReconnectHandoff({ purpose: "x", checkpoint: null }),
    ).rejects.toThrow(/refused/);
  });

  it("ships only reviewed HTTPS presets", () => {
    for (const preset of COMPATIBLE_PRESETS) {
      expect(preset.baseUrl.startsWith("https://")).toBe(true);
    }
    expect(COMPATIBLE_PRESETS.map((preset) => preset.id)).not.toContain("custom");
  });
});
