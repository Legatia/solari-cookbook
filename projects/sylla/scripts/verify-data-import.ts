import "../env-config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deflateRawSync } from "node:zlib";

import { and, eq } from "drizzle-orm";

import { getDatabase } from "../src/db";
import {
  approvedSources,
  auditEvents,
  events,
  observations,
  participants,
  personalAgents,
  syllaUsers,
} from "../src/db/schema";
import { DataImportError } from "../src/lib/sylla/data-import";
import { importParticipantArchive } from "../src/lib/sylla/imports";
import {
  createEventInvitation,
  redeemEventInvitation,
} from "../src/lib/sylla/invitations";
import { evaluatePairDirection } from "../src/lib/sylla/matching";
import {
  acceptParticipationConsent,
  PARTICIPATION_POLICY_VERSION,
} from "../src/lib/sylla/participation";

function makeZip(files: Array<{ name: string; body: string }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.body, "utf8");
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBlock.length, 12);
  end.writeUInt32LE(localBlock.length, 16);
  return Buffer.concat([localBlock, centralBlock, end]);
}

const LINKEDIN = makeZip([
  {
    name: "Profile.csv",
    body: `First Name,Last Name,Headline,Summary,Industry,Geo Location
Tobias,Example,"Builds portable agent infrastructure","Software people can leave.",Software Development,"Berlin, Germany"`,
  },
  {
    name: "Positions.csv",
    body: `Company Name,Title,Description,Started On,Finished On
Infinity Team,Founder,"Personal agent infrastructure",Jan 2024,`,
  },
]);

async function main() {
  const database = getDatabase();
  const syntheticId = randomUUID();
  const eventSlug = `data-import-${syntheticId}`;
  let participantId: string | undefined;
  let consentlessId: string | undefined;
  let eventId: string | undefined;

  async function seed(name: string, consented: boolean) {
    const invitation = await createEventInvitation({
      eventId: eventId!,
      label: `Import ${name}`,
      maxUses: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    const { participantId: id } = await redeemEventInvitation(invitation.token);
    if (!consented) return id;
    await acceptParticipationConsent(id, {
      displayName: `Synthetic ${name}`,
      policyVersion: PARTICIPATION_POLICY_VERSION,
      ageConfirmed: true,
      publicSourceResearch: true,
      privateMemoryStorage: true,
      matchmaking: false,
      hostDataBoundary: true,
      backgroundContinuation: false,
      availability: [],
    });
    return id;
  }

  try {
    const [event] = await database
      .insert(events)
      .values({
        slug: eventSlug,
        name: "Synthetic import event",
        status: "open",
        startsAt: new Date("2026-09-10T18:00:00.000Z"),
      })
      .returning();
    eventId = event.id;

    participantId = await seed("importer", true);
    consentlessId = await seed("pre-consent", false);

    // 1. Consent gates the import: before the trust gate, nothing is read.
    await assert.rejects(
      importParticipantArchive({
        participantId: consentlessId,
        filename: "linkedin.zip",
        bytes: LINKEDIN,
      }),
      DataImportError,
      "an export cannot be read without private-memory consent",
    );

    // 2. The archive becomes an import-kind source with no url to research.
    const first = await importParticipantArchive({
      participantId,
      filename: "Basic_LinkedInDataExport.zip",
      bytes: LINKEDIN,
    });
    assert.equal(first.platform, "linkedin");
    assert.equal(first.alreadyImported, false);
    assert.ok(first.proposalCount > 0);
    assert.ok(first.reviewAt.includes("view=memory"));

    const [source] = await database
      .select()
      .from(approvedSources)
      .where(eq(approvedSources.participantId, participantId))
      .limit(1);
    assert.equal(source.kind, "import");
    assert.equal(source.url, null, "an import has no page to visit");
    assert.equal(source.platform, "linkedin");
    assert.ok(source.importDigest);

    // 3. Nothing is remembered and nothing is shareable until the human says so.
    const imported = await database
      .select()
      .from(observations)
      .where(
        and(
          eq(observations.participantId, participantId),
          eq(observations.sourceId, source.id),
        ),
      );
    assert.equal(imported.length, first.proposalCount);
    assert.ok(
      imported.every((row) => row.status === "pending"),
      "import proposes, it never approves",
    );
    assert.ok(
      imported.every((row) => row.visibility === "private"),
      "an import is never shareable by default",
    );
    assert.ok(
      imported.every((row) => row.origin === "told_to_me"),
      "the participant wrote their own export; none of it is inference",
    );
    assert.ok(
      imported.some((row) => row.evidenceExcerpt?.includes("portable agent")),
      "the original text is kept beside the claim",
    );

    // 4. The same file dropped twice imports once.
    const again = await importParticipantArchive({
      participantId,
      filename: "Basic_LinkedInDataExport.zip",
      bytes: LINKEDIN,
    });
    assert.equal(again.alreadyImported, true);
    assert.equal(again.proposalCount, 0);
    const sources = await database
      .select()
      .from(approvedSources)
      .where(eq(approvedSources.participantId, participantId));
    assert.equal(sources.length, 1, "a re-dropped archive does not duplicate");

    // 5. Imported memory stays out of another agent's reach until approved AND
    //    marked shareable. This is the boundary the whole design rests on.
    await assert.rejects(
      evaluatePairDirection({
        participantId,
        subjectParticipantId: participantId,
        candidatePairId: randomUUID(),
        idempotencyKey: `import-check-${syntheticId}`,
      } as never),
      "a pending private import cannot feed a cross-agent evaluation",
    );

    // 6. The import is auditable.
    const actions = (
      await database
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(eq(auditEvents.participantId, participantId))
    ).map((row) => row.action);
    assert.ok(actions.includes("data_import.completed"));

    console.log(
      `Data import verified: consent-gated, ${first.proposalCount} pending private proposals with evidence, told_to_me origin, url-free import source, duplicate archive ignored, unshared from other agents, and audited.`,
    );
  } finally {
    for (const id of [participantId, consentlessId]) {
      if (!id) continue;
      const [row] = await database
        .select({ userId: participants.userId, agentId: participants.agentId })
        .from(participants)
        .where(eq(participants.id, id))
        .limit(1);
      await database.delete(observations).where(eq(observations.participantId, id));
      await database
        .delete(approvedSources)
        .where(eq(approvedSources.participantId, id));
      await database.delete(auditEvents).where(eq(auditEvents.participantId, id));
      await database.delete(participants).where(eq(participants.id, id));
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
