import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createReferralInvitation,
  listReferrals,
  referralAllowance,
  ReferralError,
  revokeReferralInvitation,
} from "@/lib/sylla/referrals";
import { jsonWithSession, resolveParticipant } from "@/lib/sylla/session";

function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof ReferralError
          ? error.message
          : "Could not read your invitations.",
    },
    { status: 400 },
  );
}

/** Seats left, and what happened to the ones already handed out. */
export async function GET(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const [allowance, referrals] = await Promise.all([
      referralAllowance(participant.id),
      listReferrals(participant.id),
    ]);
    return jsonWithSession({ allowance, referrals }, newToken);
  } catch (error) {
    return failure(error);
  }
}

/** Spend one seat. The link and code are returned once and not stored. */
export async function POST(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const body = (await request.json().catch(() => ({}))) as { label?: unknown };
    const invitation = await createReferralInvitation(
      participant.id,
      typeof body.label === "string" ? body.label : undefined,
    );
    return jsonWithSession(
      {
        invitation,
        allowance: await referralAllowance(participant.id),
      },
      newToken,
    );
  } catch (error) {
    return failure(error);
  }
}

/** Take back an invitation nobody has used. */
export async function DELETE(request: NextRequest) {
  try {
    const { participant, newToken } = await resolveParticipant(request);
    const { invitationId } = (await request.json()) as { invitationId?: unknown };
    if (typeof invitationId !== "string") {
      throw new ReferralError("Name the invitation to withdraw.");
    }
    await revokeReferralInvitation(participant.id, invitationId);
    return jsonWithSession(
      {
        withdrawn: true,
        allowance: await referralAllowance(participant.id),
      },
      newToken,
    );
  } catch (error) {
    return failure(error);
  }
}
