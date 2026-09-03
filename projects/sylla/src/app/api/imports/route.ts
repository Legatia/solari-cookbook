import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  DataImportError,
  IMPORT_MAX_BYTES,
  importParticipantArchive,
} from "@/lib/sylla/imports";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

export async function POST(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const form = await request.formData();
    const file = form.get("archive");
    if (!(file instanceof File)) {
      throw new DataImportError("Attach the .zip file the platform gave you.");
    }
    if (file.size > IMPORT_MAX_BYTES) {
      throw new DataImportError("That archive is larger than Sylla will read.");
    }

    const summary = await importParticipantArchive({
      participantId: participant.id,
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return jsonWithSession({ import: summary }, newToken);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sylla could not read that archive.",
      },
      { status: error instanceof DataImportError ? 400 : 500 },
    );
  }
}
