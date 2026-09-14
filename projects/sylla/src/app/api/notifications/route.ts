import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { emailIsConfigured, sendEmail } from "@/lib/sylla/email";
import {
  getContact,
  NotificationError,
  removeContact,
  startEmailVerification,
  updatePreferences,
} from "@/lib/sylla/notifications";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof NotificationError
          ? error.message
          : "Could not change how Sylla reaches you.",
    },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    return jsonWithSession(
      { contact: await getContact(participant.id), sendingEnabled: emailIsConfigured() },
      newToken,
    );
  } catch (error) {
    return failure(error);
  }
}

/** Record an address and post the proof to it. Nothing is sent until proved. */
export async function POST(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const { address } = (await request.json()) as { address?: unknown };
    if (typeof address !== "string") throw new NotificationError("Enter an address.");

    const started = await startEmailVerification(participant.id, address);
    await sendEmail({
      to: started.address,
      subject: "Confirm this address for Sylla",
      text: [
        "Someone asked Sylla to send notifications to this address.",
        "",
        "If that was you, confirm it here:",
        started.verifyUrl,
        "",
        "If it was not, ignore this. Nothing will be sent to this address unless",
        "the link above is opened, and Sylla will not write again.",
      ].join("\n"),
    });
    return jsonWithSession({ contact: await getContact(participant.id) }, newToken);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const body = (await request.json()) as {
      notifyWorkFinished?: unknown;
      notifyNeedsYou?: unknown;
    };
    return jsonWithSession(
      {
        contact: await updatePreferences(participant.id, {
          ...(typeof body.notifyWorkFinished === "boolean"
            ? { notifyWorkFinished: body.notifyWorkFinished }
            : {}),
          ...(typeof body.notifyNeedsYou === "boolean"
            ? { notifyNeedsYou: body.notifyNeedsYou }
            : {}),
        }),
      },
      newToken,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    await removeContact(participant.id);
    return jsonWithSession({ contact: await getContact(participant.id) }, newToken);
  } catch (error) {
    return failure(error);
  }
}
