import { and, desc, eq } from "drizzle-orm";

import { getDatabase } from "@/db";
import { approvedSources, observations, participantConsents } from "@/db/schema";
import { controlRoomUrl } from "@/lib/sylla/control-room";
import {
  DataImportError,
  parseArchive,
  type ImportPlatform,
} from "@/lib/sylla/data-import";
import { recordAuditEvent } from "@/lib/sylla/participation";

export { DataImportError, IMPORT_MAX_BYTES } from "@/lib/sylla/data-import";

const PLATFORM_LABELS: Record<ImportPlatform, string> = {
  linkedin: "LinkedIn export",
  x: "X archive",
};

export type ImportResult = {
  platform: ImportPlatform;
  label: string;
  filesRead: string[];
  proposalCount: number;
  alreadyImported: boolean;
  reviewAt: string;
};

/**
 * Turn a participant's own platform export into reviewable memory proposals.
 *
 * Every claim lands pending and private. Import never approves anything and
 * never marks anything shareable: the participant chooses what survives, and
 * separately chooses what another agent may ever see.
 */
export async function importParticipantArchive(input: {
  participantId: string;
  filename: string;
  bytes: Buffer;
}): Promise<ImportResult> {
  const database = getDatabase();

  // Import writes private memory, which is the same boundary the participant
  // agreed to for research. Without it there is nowhere lawful to put this.
  const [consent] = await database
    .select({ privateMemoryStorage: participantConsents.privateMemoryStorage })
    .from(participantConsents)
    .where(eq(participantConsents.participantId, input.participantId))
    .orderBy(desc(participantConsents.acceptedAt))
    .limit(1);
  if (!consent?.privateMemoryStorage) {
    throw new DataImportError(
      "Reviewable private memory has to be enabled before Sylla can read an export.",
    );
  }

  const archive = parseArchive(input.bytes);
  const label = PLATFORM_LABELS[archive.platform];
  const reviewAt = controlRoomUrl("memory");

  const [existing] = await database
    .select({ id: approvedSources.id })
    .from(approvedSources)
    .where(
      and(
        eq(approvedSources.participantId, input.participantId),
        eq(approvedSources.importDigest, archive.digest),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      platform: archive.platform,
      label,
      filesRead: archive.filesRead,
      proposalCount: 0,
      alreadyImported: true,
      reviewAt,
    };
  }

  const [source] = await database
    .insert(approvedSources)
    .values({
      participantId: input.participantId,
      kind: "import",
      platform: archive.platform,
      importFilename: input.filename.slice(0, 200),
      importDigest: archive.digest,
      label,
      extractedTitle: `${label} · ${archive.filesRead.length} files read`,
      researchStatus: "imported",
    })
    .returning();

  await database.insert(observations).values(
    archive.claims.map((item) => ({
      participantId: input.participantId,
      sourceId: source.id,
      claim: item.claim,
      evidenceExcerpt: item.evidenceExcerpt,
      origin: item.origin,
      confidence: item.confidence,
      status: "pending" as const,
      visibility: "private" as const,
    })),
  );

  await recordAuditEvent({
    participantId: input.participantId,
    actorType: "participant",
    action: "data_import.completed",
    entityType: "approved_source",
    entityId: source.id,
    metadata: {
      platform: archive.platform,
      filesRead: archive.filesRead.join(","),
      proposalCount: archive.claims.length,
    },
  });

  return {
    platform: archive.platform,
    label,
    filesRead: archive.filesRead,
    proposalCount: archive.claims.length,
    alreadyImported: false,
    reviewAt,
  };
}

/**
 * Spoken guidance for the conversational surface. The agent explains where the
 * file comes from; the participant drops it in their own control room, because
 * an archive should never travel through a chat transcript.
 */
export function dataImportGuide() {
  return {
    why: "An export is richer than anything Sylla could read from a public page, it belongs to the participant already, and it makes their agent useful on day one.",
    platforms: [
      {
        platform: "linkedin" as const,
        where: "LinkedIn → Settings → Data Privacy → Get a copy of your data",
        note: "Choose the larger archive; LinkedIn emails it within a few minutes to a day.",
        reads: ["Profile.csv", "Positions.csv", "Education.csv", "Skills.csv"],
      },
      {
        platform: "x" as const,
        where: "X → Settings → Your account → Download an archive of your data",
        note: "X takes up to 24 hours to prepare it.",
        reads: ["data/profile.js", "data/account.js"],
      },
    ],
    boundary:
      "Sylla reads only the files listed above, turns them into private memory proposals, and approves nothing. The participant keeps, corrects, or forgets each one, and chooses separately what may ever be shareable.",
    uploadAt: controlRoomUrl("memory"),
    neverInChat:
      "Never ask the participant to paste an export into the conversation. Point them at uploadAt.",
  };
}
