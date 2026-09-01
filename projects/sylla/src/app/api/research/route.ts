import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDatabase } from "@/db";
import {
  approvedSources,
  observations,
  participants,
} from "@/db/schema";
import { createSolariAdapters } from "@/lib/solari";
import { assertPublicHttpUrl } from "@/lib/solari/url-policy";
import { researchInputSchema } from "@/lib/sylla/contracts";
import { synthesizeObservationDrafts } from "@/lib/sylla/research";
import { updatePortableAgent } from "@/lib/sylla/identity";
import {
  jsonWithSession,
  loadSessionState,
  retireParticipantWorkspace,
  resolveParticipant,
} from "@/lib/sylla/session";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { participant, newToken } = await resolveParticipant(request);

  try {
    const parsed = researchInputSchema.parse(await request.json());
    const sources = parsed.sources.map((source) => ({
      ...source,
      url: assertPublicHttpUrl(source.url).toString(),
    }));
    const uniqueSources = Array.from(
      new Map(sources.map((source) => [source.url, source])).values(),
    );

    if (uniqueSources.length !== sources.length) {
      return jsonWithSession(
        { error: "Each approved source must be unique." },
        newToken,
        { status: 400 },
      );
    }

    const database = getDatabase();
    const adapters = await createSolariAdapters();
    await retireParticipantWorkspace(participant.id);

    await database
      .delete(observations)
      .where(eq(observations.participantId, participant.id));
    await database
      .delete(approvedSources)
      .where(eq(approvedSources.participantId, participant.id));
    await database
      .update(participants)
      .set({
        agentName: parsed.agentName,
        intent: parsed.focus,
        status: "onboarding",
        researchProvider: null,
        researchRunReference: null,
        researchCompletedAt: null,
      })
      .where(eq(participants.id, participant.id));
    await updatePortableAgent(participant.id, {
      agentName: parsed.agentName,
      focus: parsed.focus,
    });

    const sourceRows = await database
      .insert(approvedSources)
      .values(
        uniqueSources.map((source) => ({
          participantId: participant.id,
          url: source.url,
          label: source.label || new URL(source.url).hostname,
          researchStatus: "researching",
        })),
      )
      .returning();

    try {
      const result = await adapters.browser.research({
        participantRef: participant.id,
        sources: sourceRows.map((source) => ({
          id: source.id,
          url: source.url,
          label: source.label ?? undefined,
        })),
      });

      for (const evidence of result.evidence) {
        await database
          .update(approvedSources)
          .set({
            url: evidence.sourceUrl,
            extractedTitle: evidence.sourceTitle,
            evidenceExcerpt: evidence.excerpt,
            researchStatus: "complete",
          })
          .where(
            and(
              eq(approvedSources.id, evidence.sourceId),
              eq(approvedSources.participantId, participant.id),
            ),
          );
      }

      const drafts = synthesizeObservationDrafts(parsed.focus, result.evidence);
      await database.insert(observations).values(
        drafts.map((draft) => ({
          ...draft,
          participantId: participant.id,
        })),
      );
      await database
        .update(participants)
        .set({
          status: "ready",
          researchProvider: result.provider,
          researchRunReference: result.runReference,
          researchCompletedAt: new Date(),
        })
        .where(eq(participants.id, participant.id));

      const state = await loadSessionState(participant.id);
      return jsonWithSession({ state }, newToken);
    } catch (error) {
      await database
        .update(approvedSources)
        .set({ researchStatus: "failed" })
        .where(eq(approvedSources.participantId, participant.id));
      throw error;
    }
  } catch (error) {
    console.error("Sylla research failed", error);
    return jsonWithSession(
      {
        error:
          error instanceof Error
            ? error.message
            : "Research could not be completed.",
      },
      newToken,
      { status: 400 },
    );
  }
}
