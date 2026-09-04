import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { lookup } from "node:dns/promises";

import { eq } from "drizzle-orm";

import { assertPublicHttpUrl, isPrivateAddress } from "@/lib/solari/url-policy";

import { getDatabase } from "@/db";
import { participantModelKeys } from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import {
  createAnthropicInternalModelAdapter,
  createOpenAiCompatibleInternalModelAdapter,
  createOpenAiInternalModelAdapter,
  type InternalModelAdapter,
} from "@/lib/sylla/internal-model";
import { recordAuditEvent } from "@/lib/sylla/participation";

/**
 * Bring-your-own model access.
 *
 * The host LLM does the reasoning while it is connected, on the participant's
 * own subscription. This key exists for the other case: the host connection is
 * gone and approved work is still waiting. Until Sylla has its own billing,
 * that inference has to be paid for by the person who asked for it.
 *
 * The key is stored encrypted rather than hashed because Sylla must spend it.
 * It is never returned to any client, and deleting it is immediate.
 */

export type ModelProvider = "anthropic" | "openai" | "openai_compatible";

export class ModelKeyError extends Error {}

export const PROVIDER_DEFAULTS: Record<
  ModelProvider,
  { label: string; defaultModel: string; keysAt: string; prefixHint: string }
> = {
  anthropic: {
    label: "Anthropic",
    defaultModel: "claude-opus-5",
    keysAt: "https://console.anthropic.com/settings/keys",
    prefixHint: "sk-ant-",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5",
    keysAt: "https://platform.openai.com/api-keys",
    prefixHint: "sk-",
  },
  openai_compatible: {
    label: "OpenAI-compatible",
    defaultModel: "",
    keysAt: "",
    prefixHint: "",
  },
};

/**
 * Starting points for anything speaking the OpenAI `/chat/completions` dialect.
 *
 * These only prefill the form: both the base URL and the model stay editable,
 * so a preset that moves is a one-line correction for the participant rather
 * than a dead end, and anything not listed works through Custom.
 */
export const COMPATIBLE_PRESETS = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    id: "qwen",
    label: "Qwen (Alibaba DashScope)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  {
    id: "moonshot",
    label: "Moonshot / Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
  },
  {
    id: "zhipu",
    label: "Zhipu GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-plus",
  },
  {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimax.chat/v1",
    model: "abab6.5s-chat",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "",
  },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "" },
  {
    id: "together",
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
    model: "",
  },
  { id: "custom", label: "Custom endpoint", baseUrl: "", model: "" },
] as const;

/**
 * Resolve a hostname and refuse it if *any* address it answers with is private.
 *
 * Checking the literal string is not enough: `evil.example.com` is a public
 * name that can resolve to 169.254.169.254, and a host with several A records
 * only needs one of them to point inward. This is the check that actually
 * closes the hole; the string check above only catches the naive case.
 */
export type AddressResolver = (
  hostname: string,
) => Promise<Array<{ address: string }>>;

const defaultResolver: AddressResolver = (hostname) =>
  lookup(hostname, { all: true });

async function assertPublicDestination(
  hostname: string,
  resolver: AddressResolver = defaultResolver,
) {
  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new ModelKeyError("That host could not be resolved.");
  }
  if (!addresses.length) {
    throw new ModelKeyError("That host could not be resolved.");
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new ModelKeyError(
        "That host resolves to a private address. Use the provider's public endpoint.",
      );
    }
  }
}

/**
 * A participant-supplied base URL is a server-side fetch target, so it gets the
 * same treatment as an approved research source: HTTPS only, no private,
 * local, or internal addresses. Without this, the field is an SSRF hole.
 */
function assertCompatibleBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new ModelKeyError("Enter the provider's base URL.");
  let url: URL;
  try {
    url = assertPublicHttpUrl(trimmed);
  } catch (error) {
    throw new ModelKeyError(
      error instanceof Error && /Private|local|internal/i.test(error.message)
        ? "That base URL points somewhere private. Use the provider's public HTTPS endpoint."
        : "That base URL is not a valid HTTPS address.",
    );
  }
  if (url.protocol !== "https:") {
    throw new ModelKeyError("The base URL must use HTTPS.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function encryptionKey() {
  const secret = process.env.MODEL_KEY_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new ModelKeyError(
      "MODEL_KEY_SECRET (or AUTH_SECRET) must be set before a model key can be stored.",
    );
  }
  // A stored key must survive restarts, so derive deterministically from the
  // deployment secret rather than generating one per process.
  return createHash("sha256").update(`sylla:model-key:${secret}`).digest();
}

function encrypt(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decrypt(record: { ciphertext: string; iv: string; authTag: string }) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(record.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Confirms the key works before Sylla relies on it during a disconnect.
 *
 * For a compatible endpoint the probe is a one-token completion rather than a
 * model listing: `/models` is inconsistently implemented across providers, and
 * a completion proves the exact path the fallback will use.
 */
export async function verifyModelKey(input: {
  provider: ModelProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Injectable so tests stay hermetic; production uses the real resolver. */
  resolver?: AddressResolver;
}) {
  const { provider, apiKey } = input;
  const label = PROVIDER_DEFAULTS[provider].label;
  const fetchImpl = input.fetchImpl ?? fetch;
  if (provider === "openai_compatible" && input.baseUrl) {
    await assertPublicDestination(new URL(input.baseUrl).hostname, input.resolver);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  const request: [string, RequestInit] =
    provider === "anthropic"
      ? [
          "https://api.anthropic.com/v1/models",
          {
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            signal: controller.signal,
          },
        ]
      : provider === "openai"
        ? [
            "https://api.openai.com/v1/models",
            {
              headers: { authorization: `Bearer ${apiKey}` },
              signal: controller.signal,
            },
          ]
        : [
            `${input.baseUrl}/chat/completions`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${apiKey}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: input.model,
                max_tokens: 1,
                messages: [{ role: "user", content: "ok" }],
              }),
              // Never follow a redirect: the key travels with this request, and
              // a 302 to an internal address would carry it there.
              redirect: "manual" as const,
              signal: controller.signal,
            },
          ];

  try {
    const response = await fetchImpl(request[0], request[1]);
    if (response.status === 401 || response.status === 403) {
      throw new ModelKeyError(`${label} rejected that key.`);
    }
    if (response.status >= 300 && response.status < 400) {
      throw new ModelKeyError(
        "That endpoint redirects. Use the address it redirects to directly, so your key is never forwarded somewhere you did not name.",
      );
    }
    if (response.status === 404) {
      throw new ModelKeyError(
        "That endpoint did not answer at /chat/completions. Check the base URL — most providers want it to end in /v1.",
      );
    }
    if (response.status === 400 || response.status === 422) {
      throw new ModelKeyError(
        "That endpoint rejected the request. Check the model name.",
      );
    }
    if (!response.ok) {
      throw new ModelKeyError(`${label} could not be reached to check that key.`);
    }
  } catch (error) {
    if (error instanceof ModelKeyError) throw error;
    throw new ModelKeyError(`${label} could not be reached to check that key.`);
  } finally {
    clearTimeout(timeout);
  }
}

export type ModelKeyView = {
  provider: ModelProvider;
  providerLabel: string;
  model: string;
  baseUrl: string | null;
  keyHint: string;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export async function saveModelKey(input: {
  participantId: string;
  provider: ModelProvider;
  model?: string;
  baseUrl?: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  resolver?: AddressResolver;
}): Promise<ModelKeyView> {
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 12) throw new ModelKeyError("That does not look like an API key.");
  const provider = input.provider;
  const model = (input.model?.trim() || PROVIDER_DEFAULTS[provider].defaultModel).slice(
    0,
    120,
  );
  if (!model) {
    throw new ModelKeyError("Name the model Sylla should call.");
  }
  const baseUrl =
    provider === "openai_compatible"
      ? assertCompatibleBaseUrl(input.baseUrl ?? "")
      : null;

  await verifyModelKey({
    provider,
    apiKey,
    baseUrl: baseUrl ?? undefined,
    model,
    fetchImpl: input.fetchImpl,
    resolver: input.resolver,
  });

  const identity = await ensurePortableIdentity(input.participantId);
  const sealed = encrypt(apiKey);
  const values = {
    userId: identity.userId,
    provider,
    model,
    baseUrl,
    ...sealed,
    keyHint: apiKey.slice(-4),
    verifiedAt: new Date(),
  };
  const [saved] = await getDatabase()
    .insert(participantModelKeys)
    .values(values)
    .onConflictDoUpdate({
      target: participantModelKeys.userId,
      set: { ...values, lastUsedAt: null },
    })
    .returning();

  await recordAuditEvent({
    participantId: input.participantId,
    actorType: "participant",
    action: "model_key.saved",
    entityType: "participant_model_key",
    entityId: saved.id,
    // The key itself never appears in an audit row.
    metadata: { provider, model, baseUrl, keyHint: saved.keyHint },
  });
  return view(saved);
}

function view(row: typeof participantModelKeys.$inferSelect): ModelKeyView {
  return {
    provider: row.provider,
    providerLabel: PROVIDER_DEFAULTS[row.provider].label,
    model: row.model,
    baseUrl: row.baseUrl,
    keyHint: row.keyHint,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Never includes the key. There is no endpoint that returns it. */
export async function getModelKeyView(
  participantId: string,
): Promise<ModelKeyView | null> {
  const identity = await ensurePortableIdentity(participantId);
  const [row] = await getDatabase()
    .select()
    .from(participantModelKeys)
    .where(eq(participantModelKeys.userId, identity.userId))
    .limit(1);
  return row ? view(row) : null;
}

export async function deleteModelKey(participantId: string) {
  const identity = await ensurePortableIdentity(participantId);
  const [removed] = await getDatabase()
    .delete(participantModelKeys)
    .where(eq(participantModelKeys.userId, identity.userId))
    .returning();
  if (removed) {
    await recordAuditEvent({
      participantId,
      actorType: "participant",
      action: "model_key.deleted",
      entityType: "participant_model_key",
      entityId: removed.id,
      metadata: { provider: removed.provider },
    });
  }
  return { deleted: Boolean(removed) };
}

/**
 * Resolve the adapter for one participant's bounded fallback work.
 *
 * Their own key first, because they are the one who benefits and Sylla has no
 * billing yet. Falls through to the deployment's own configuration, and then to
 * the deterministic adapter, which makes no API call at all.
 */
export async function resolveParticipantModelAdapter(
  participantId: string,
  fallback: () => InternalModelAdapter,
): Promise<InternalModelAdapter> {
  const identity = await ensurePortableIdentity(participantId);
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(participantModelKeys)
    .where(eq(participantModelKeys.userId, identity.userId))
    .limit(1);
  if (!row) return fallback();

  let apiKey: string;
  try {
    apiKey = decrypt(row);
  } catch {
    // A rotated deployment secret makes stored keys unreadable. Degrade to the
    // deterministic path rather than failing the participant's approved work.
    return fallback();
  }

  await database
    .update(participantModelKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(participantModelKeys.id, row.id));

  if (row.provider === "anthropic") {
    return createAnthropicInternalModelAdapter({ apiKey, model: row.model });
  }
  if (row.provider === "openai_compatible") {
    // Re-check the stored origin every time. A host that has since started
    // resolving inward must not become a fetch target on the strength of a
    // validation that happened once, weeks ago.
    try {
      const url = assertPublicHttpUrl(row.baseUrl ?? "");
      await assertPublicDestination(url.hostname);
    } catch {
      return fallback();
    }
    return createOpenAiCompatibleInternalModelAdapter({
      apiKey,
      model: row.model,
      baseUrl: row.baseUrl ?? "",
    });
  }
  return createOpenAiInternalModelAdapter({ apiKey, model: row.model });
}
