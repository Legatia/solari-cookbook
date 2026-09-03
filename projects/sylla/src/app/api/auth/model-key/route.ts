import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  COMPATIBLE_PRESETS,
  deleteModelKey,
  getModelKeyView,
  ModelKeyError,
  PROVIDER_DEFAULTS,
  saveModelKey,
} from "@/lib/sylla/model-keys";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Sylla could not update model access.",
    },
    { status: error instanceof ModelKeyError ? 400 : 500 },
  );
}

/** Returns provider options and the stored key's metadata — never the key. */
export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(
      {
        modelKey: await getModelKeyView(participant.id),
        providers: Object.entries(PROVIDER_DEFAULTS).map(([provider, meta]) => ({
          provider,
          ...meta,
        })),
        compatiblePresets: COMPATIBLE_PRESETS,
      },
      newToken,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const body = (await request.json()) as {
      provider?: unknown;
      model?: unknown;
      baseUrl?: unknown;
      apiKey?: unknown;
    };
    if (
      body.provider !== "anthropic" &&
      body.provider !== "openai" &&
      body.provider !== "openai_compatible"
    ) {
      throw new ModelKeyError("Choose a provider.");
    }
    if (typeof body.apiKey !== "string") {
      throw new ModelKeyError("Paste an API key.");
    }
    const saved = await saveModelKey({
      participantId: participant.id,
      provider: body.provider,
      model: typeof body.model === "string" ? body.model : undefined,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
      apiKey: body.apiKey,
    });
    return jsonWithSession({ modelKey: saved }, newToken);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(await deleteModelKey(participant.id), newToken);
  } catch (error) {
    return failure(error);
  }
}
