import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  ensureSubject,
  listSubjects,
  recordSubjectClaim,
  SubjectError,
} from "@/lib/sylla/subjects";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof SubjectError ? error.message : "Could not open that dossier.",
    },
    { status: 400 },
  );
}

/** Every dossier this participant keeps. Never anyone else's. */
export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(
      { subjects: await listSubjects(participant.id), privateToYou: true },
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
      name?: unknown;
      kind?: unknown;
      relationship?: unknown;
      note?: unknown;
    };
    if (typeof body.name !== "string") throw new SubjectError("Name the dossier.");
    const kind = body.kind === "organization" ? "organization" : "person";
    const subject = await ensureSubject(participant.id, {
      kind,
      name: body.name,
      relationship: typeof body.relationship === "string" ? body.relationship : null,
    });
    if (typeof body.note === "string" && body.note.trim()) {
      await recordSubjectClaim({
        participantId: participant.id,
        subjectId: subject.id,
        claim: body.note,
        origin: "told_to_me",
      });
    }
    return jsonWithSession(
      { subjects: await listSubjects(participant.id), opened: subject.id },
      newToken,
    );
  } catch (error) {
    return failure(error);
  }
}
