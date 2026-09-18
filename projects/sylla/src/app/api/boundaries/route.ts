import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  type BoundaryKind,
  BoundaryError,
  releaseBoundary,
  reviewShield,
  setBoundary,
} from "@/lib/sylla/boundaries";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

const KINDS: BoundaryKind[] = ["paused", "mutual_only", "weekly_limit"];

function isKind(value: unknown): value is BoundaryKind {
  return typeof value === "string" && KINDS.includes(value as BoundaryKind);
}

function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof BoundaryError
          ? error.message
          : "Could not change that boundary.",
    },
    { status: 400 },
  );
}

/** What is in force, and what it has turned away. */
export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession({ shield: await reviewShield(participant.id) }, newToken);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const body = (await request.json()) as {
      kind?: unknown;
      threshold?: unknown;
      until?: unknown;
    };
    if (!isKind(body.kind)) throw new BoundaryError("Choose a boundary to set.");
    await setBoundary(participant.id, {
      kind: body.kind,
      threshold: typeof body.threshold === "number" ? body.threshold : undefined,
      until: typeof body.until === "string" ? new Date(body.until) : undefined,
    });
    return jsonWithSession({ shield: await reviewShield(participant.id) }, newToken);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const { kind } = (await request.json()) as { kind?: unknown };
    if (!isKind(kind)) throw new BoundaryError("Choose a boundary to lift.");
    await releaseBoundary(participant.id, kind);
    return jsonWithSession({ shield: await reviewShield(participant.id) }, newToken);
  } catch (error) {
    return failure(error);
  }
}
