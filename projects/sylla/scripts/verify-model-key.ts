import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  auditEvents,
  events,
  participantModelKeys,
  participants,
  personalAgents,
  syllaUsers,
} from "../src/db/schema";
import { createDeterministicInternalModelAdapter } from "../src/lib/sylla/internal-model";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import {
  deleteModelKey,
  getModelKeyView,
  ModelKeyError,
  resolveParticipantModelAdapter,
  saveModelKey,
} from "../src/lib/sylla/model-keys";

const ACCEPTING_PROVIDER = (async () =>
  new Response("{}", { status: 200 })) as unknown as typeof fetch;
const REJECTING_PROVIDER = (async () =>
  new Response("", { status: 401 })) as unknown as typeof fetch;

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `model-key-${syntheticId}`;
  const apiKey = `sk-ant-verify-${syntheticId}`;
  let participantId: string | undefined;
  let eventId: string | undefined;
  const originalSecret = process.env.MODEL_KEY_SECRET;
  process.env.MODEL_KEY_SECRET = `verify-secret-${syntheticId}`;

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: eventSlug,
        name: "Synthetic model key event",
        status: "open",
        startsAt: new Date("2026-09-10T18:00:00.000Z"),
      })
      .returning();
    eventId = event.id;
    const invitation = await createEventInvitation({
      eventId,
      label: "Model key",
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    ({ participantId } = await redeemEventInvitation(invitation.token));

    // 1. With no key, the fallback stays deterministic and makes no API call.
    assert.equal(await getModelKeyView(participantId), null);
    const withoutKey = await resolveParticipantModelAdapter(
      participantId,
      createDeterministicInternalModelAdapter,
    );
    assert.equal(withoutKey.provider, "sylla-deterministic");

    // 2. A key the provider rejects is never stored.
    await assert.rejects(
      saveModelKey({
        participantId,
        provider: "anthropic",
        apiKey,
        fetchImpl: REJECTING_PROVIDER,
      }),
      ModelKeyError,
    );
    assert.equal(await getModelKeyView(participantId), null);

    // 3. A verified key is stored encrypted, with only a hint kept in clear.
    const saved = await saveModelKey({
      participantId,
      provider: "anthropic",
      apiKey,
      fetchImpl: ACCEPTING_PROVIDER,
    });
    assert.equal(saved.provider, "anthropic");
    assert.equal(saved.model, "claude-opus-5", "defaults to a current model");
    assert.equal(saved.keyHint, apiKey.slice(-4));
    assert.ok(saved.verifiedAt);

    const [row] = await database
      .select()
      .from(participantModelKeys)
      .where(eq(participantModelKeys.provider, "anthropic"))
      .limit(1);
    assert.ok(row.ciphertext && row.iv && row.authTag);
    const stored = JSON.stringify(row);
    assert.ok(!stored.includes(apiKey), "the key is never stored in clear text");

    // 4. Nothing that leaves the server carries the key.
    const view = await getModelKeyView(participantId);
    assert.ok(!JSON.stringify(view).includes(apiKey), "no read path returns the key");

    // 5. The participant's own key is what the fallback resolves to.
    const withKey = await resolveParticipantModelAdapter(
      participantId,
      createDeterministicInternalModelAdapter,
    );
    assert.equal(withKey.provider, "anthropic");
    assert.equal(withKey.model, "claude-opus-5");
    const [used] = await database
      .select({ lastUsedAt: participantModelKeys.lastUsedAt })
      .from(participantModelKeys)
      .where(eq(participantModelKeys.id, row.id))
      .limit(1);
    assert.ok(used.lastUsedAt, "resolution records that the key was spent");

    // 6. A rotated deployment secret degrades instead of failing the work.
    process.env.MODEL_KEY_SECRET = `rotated-${syntheticId}`;
    const afterRotation = await resolveParticipantModelAdapter(
      participantId,
      createDeterministicInternalModelAdapter,
    );
    assert.equal(
      afterRotation.provider,
      "sylla-deterministic",
      "an unreadable key falls back rather than throwing",
    );
    process.env.MODEL_KEY_SECRET = `verify-secret-${syntheticId}`;

    // 7. A compatible endpoint stores its base URL and resolves to the
    //    chat-completions adapter.
    const compatible = await saveModelKey({
      participantId,
      provider: "openai_compatible",
      baseUrl: "https://api.deepseek.com/v1/",
      model: "deepseek-chat",
      apiKey,
      fetchImpl: ACCEPTING_PROVIDER,
    });
    assert.equal(compatible.provider, "openai_compatible");
    assert.equal(
      compatible.baseUrl,
      "https://api.deepseek.com/v1",
      "a trailing slash is normalized away",
    );
    const compatibleAdapter = await resolveParticipantModelAdapter(
      participantId,
      createDeterministicInternalModelAdapter,
    );
    assert.equal(compatibleAdapter.provider, "openai_compatible");
    assert.equal(compatibleAdapter.model, "deepseek-chat");

    // 8. A base URL pointing inward is refused: this field is a server-side
    //    fetch target, so it gets the same policy as an approved source.
    for (const hostile of [
      "http://localhost:11434/v1",
      "https://127.0.0.1/v1",
      "https://10.0.0.5/v1",
      "https://169.254.169.254/latest",
      "http://api.deepseek.com/v1",
    ]) {
      await assert.rejects(
        saveModelKey({
          participantId,
          provider: "openai_compatible",
          baseUrl: hostile,
          model: "deepseek-chat",
          apiKey,
          fetchImpl: ACCEPTING_PROVIDER,
        }),
        ModelKeyError,
        `${hostile} must be refused`,
      );
    }

    // 9. Deletion is immediate and audited; the key never appears in the log.
    assert.deepEqual(await deleteModelKey(participantId), { deleted: true });
    assert.equal(await getModelKeyView(participantId), null);
    const logged = await database
      .select({ action: auditEvents.action, metadata: auditEvents.metadata })
      .from(auditEvents)
      .where(eq(auditEvents.participantId, participantId));
    const actions = logged.map((entry) => entry.action);
    assert.ok(actions.includes("model_key.saved"));
    assert.ok(actions.includes("model_key.deleted"));
    assert.ok(!JSON.stringify(logged).includes(apiKey), "audit rows hold no key");

    console.log(
      "Model key verified: absent means deterministic, a rejected key is not stored, a verified key is encrypted with only a 4-character hint, no read path or audit row exposes it, the fallback resolves to the participant's own key, a rotated secret degrades safely, a compatible endpoint normalizes and resolves to chat-completions, private and plaintext base URLs are refused, and deletion is immediate.",
    );
  } finally {
    if (originalSecret === undefined) delete process.env.MODEL_KEY_SECRET;
    else process.env.MODEL_KEY_SECRET = originalSecret;
    if (participantId) {
      const [row] = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);
      await database
        .delete(auditEvents)
        .where(eq(auditEvents.participantId, participantId));
      await database.delete(participants).where(eq(participants.id, participantId));
      if (row?.agentId) {
        await database.delete(personalAgents).where(eq(personalAgents.id, row.agentId));
      }
      if (row?.userId) {
        await database.delete(syllaUsers).where(eq(syllaUsers.id, row.userId));
      }
    }
    if (eventId) {
      await database.delete(auditEvents).where(eq(auditEvents.eventId, eventId));
    }
    await database.delete(events).where(eq(events.slug, eventSlug));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
