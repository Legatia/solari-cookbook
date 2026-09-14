import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  deleteSubject,
  getDossier,
  isSubjectStage,
  recordSubjectClaim,
  SubjectError,
  updateSubject,
} from "@/lib/sylla/subjects";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof SubjectError ? error.message : "Could not read that dossier." },
    { status: 400 },
  );
}

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/subjects/[id]">,
) {
  try {
    const { id } = await context.params;
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession({ dossier: await getDossier(participant.id, id) }, newToken);
  } catch (error) {
    return failure(error);
  }
}

/** Add a note, or change the relationship and what happens next. */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/subjects/[id]">,
) {
  try {
    const { id } = await context.params;
    const { participant, newToken } = await resolveParticipant(request);
    const body = (await request.json()) as {
      note?: unknown;
      relationship?: unknown;
      nextAction?: unknown;
      nextActionAt?: unknown;
      stage?: unknown;
      contact?: unknown;
    };

    if (typeof body.note === "string" && body.note.trim()) {
      await recordSubjectClaim({
        participantId: participant.id,
        subjectId: id,
        claim: body.note,
        origin: "told_to_me",
        contact: body.contact === true,
      });
    }
    if (
      body.relationship !== undefined ||
      body.nextAction !== undefined ||
      body.nextActionAt !== undefined ||
      body.stage !== undefined
    ) {
      if (body.stage !== undefined && !isSubjectStage(body.stage)) {
        throw new SubjectError("That is not a stage.");
      }
      await updateSubject(participant.id, id, {
        ...(body.relationship === undefined
          ? {}
          : { relationship: String(body.relationship) }),
        ...(body.nextAction === undefined
          ? {}
          : { nextAction: String(body.nextAction) }),
        ...(body.nextActionAt === undefined
          ? {}
          : {
              nextActionAt:
                body.nextActionAt === null ? null : new Date(String(body.nextActionAt)),
            }),
        ...(body.stage === undefined ? {} : { stage: body.stage }),
      });
    }
    return jsonWithSession({ dossier: await getDossier(participant.id, id) }, newToken);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/subjects/[id]">,
) {
  try {
    const { id } = await context.params;
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(await deleteSubject(participant.id, id), newToken);
  } catch (error) {
    return failure(error);
  }
}
