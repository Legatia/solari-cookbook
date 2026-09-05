import "../env-config";

import assert from "node:assert/strict";

import {
  createConfiguredInternalModelAdapter,
  InternalModelConfigurationError,
} from "../src/lib/sylla/internal-model";

/**
 * One real call to the fallback model, with this project's own credentials.
 *
 * The mock adapter proves the wiring; only this proves the deployment can
 * actually finish approved work after a host disconnects. It refuses to pass in
 * mock mode on purpose — a green run here has to mean a network round trip
 * happened.
 */
async function main() {
  const mode = process.env.SYLLA_INTERNAL_MODEL_MODE;
  if (mode !== "live") {
    throw new InternalModelConfigurationError(
      "Set SYLLA_INTERNAL_MODEL_MODE=live. This script exists to prove a real call, so it will not pass against the deterministic adapter.",
    );
  }
  if (!process.env.MODEL_API_KEY) {
    throw new InternalModelConfigurationError(
      "MODEL_API_KEY is empty. Set it (and SYLLA_INTERNAL_MODEL, plus SYLLA_INTERNAL_MODEL_BASE_URL for an OpenAI-compatible provider) before running this.",
    );
  }

  const adapter = createConfiguredInternalModelAdapter();
  const started = Date.now();
  const handoff = await adapter.generateReconnectHandoff({
    purpose: "Confirm the venue booking and note what is still unanswered.",
    checkpoint: {
      summary:
        "Emailed the venue for a quote on the 14th and asked whether the room holds 40.",
      completedActions: [
        "Found three candidate venues",
        "Sent an availability enquiry to the first",
      ],
      nextAction: "Chase the venue if there is no reply by Friday",
      evidenceRefs: ["obs_venue_quote"],
    },
  });
  const elapsedMs = Date.now() - started;

  assert.equal(
    handoff.deterministicRecoveryUsed,
    false,
    "the provider returned something the schema could not parse, so this fell back to canned text",
  );
  assert.ok(handoff.summary.trim().length > 0, "the model returned an empty summary");
  assert.ok(handoff.model, "the adapter reported no model name");
  assert.ok(
    (handoff.outputTokens ?? 0) > 0,
    "no output tokens were billed, so no generation happened",
  );

  console.log(
    JSON.stringify({
      verified: true,
      provider: handoff.provider,
      model: handoff.model,
      elapsedMs,
      inputTokens: handoff.inputTokens,
      outputTokens: handoff.outputTokens,
      summary: handoff.summary,
      nextAction: handoff.nextAction,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
