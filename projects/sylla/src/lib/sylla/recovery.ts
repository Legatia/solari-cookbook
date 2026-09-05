import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import { auditEvents, recoveryCodes } from "@/db/schema";
import { ensurePortableIdentity } from "@/lib/sylla/identity";
import { newUserSessionCredential } from "@/lib/sylla/session";

/**
 * The last way back in.
 *
 * Passkeys and connected AI clients both live on devices. Lose every device and,
 * without this, the agent is gone — which would make "your agent is portable"
 * true only while your hardware survives.
 *
 * These are deliberately boring: hashed like passwords, single use, shown once,
 * and they authenticate nothing except the right to start a new session. There
 * is no email reset behind them, because Sylla holds no email to reset to.
 */

const CODE_COUNT = 8;
/** Crockford base32: no I, L, O or U, so a written-down code survives being read back. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUPS = 3;
const GROUP_LENGTH = 4;

export class RecoveryError extends Error {}

function hash(code: string) {
  return createHash("sha256").update(normalize(code)).digest("hex");
}

export function normalize(code: string) {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

function generateCode() {
  const groups: string[] = [];
  for (let group = 0; group < GROUPS; group += 1) {
    let chunk = "";
    for (let index = 0; index < GROUP_LENGTH; index += 1) {
      chunk += ALPHABET[randomBytes(1)[0] % ALPHABET.length];
    }
    groups.push(chunk);
  }
  return groups.join("-");
}

/**
 * Issue a fresh set, replacing any that came before.
 *
 * Regenerating invalidates the old set on purpose: a participant who thinks
 * their codes leaked needs one action that makes that true, not a list of
 * individual revocations.
 */
export async function issueRecoveryCodes(participantId: string) {
  const identity = await ensurePortableIdentity(participantId);
  const database = getDatabase();
  const codes = Array.from({ length: CODE_COUNT }, generateCode);
  // neon-http cannot run an interactive transaction, but `batch` is sent as
  // one Neon transaction. A failed insert therefore leaves the previous set
  // usable instead of deleting the participant's last way back in.
  await database.batch([
    database
      .delete(recoveryCodes)
      .where(eq(recoveryCodes.userId, identity.userId)),
    database.insert(recoveryCodes).values(
      codes.map((code) => ({ userId: identity.userId, codeHash: hash(code) })),
    ),
    database.insert(auditEvents).values({
      participantId,
      actorType: "participant",
      action: "recovery_codes.issued",
      entityType: "sylla_user",
      entityId: identity.userId,
      metadata: { count: codes.length },
    }),
  ]);

  // Returned exactly once. Nothing stores the plaintext, so a participant who
  // loses these has to generate a new set from a device they still control.
  return { codes, count: codes.length };
}

export async function recoveryCodeStatus(participantId: string) {
  const identity = await ensurePortableIdentity(participantId);
  const rows = await getDatabase()
    .select({ usedAt: recoveryCodes.usedAt })
    .from(recoveryCodes)
    .where(eq(recoveryCodes.userId, identity.userId));
  return {
    issued: rows.length,
    remaining: rows.filter((row) => !row.usedAt).length,
  };
}

/**
 * Redeem one code for a browser session.
 *
 * The code is consumed by a conditional update, so two people racing the same
 * code produce exactly one session. Comparison is constant time, and a wrong
 * code and an unknown code fail identically.
 */
export async function redeemRecoveryCode(rawCode: string) {
  const normalized = normalize(rawCode);
  if (normalized.length !== GROUPS * GROUP_LENGTH) {
    throw new RecoveryError("That is not a valid recovery code.");
  }
  const database = getDatabase();
  const candidateHash = hash(normalized);

  const [row] = await database
    .select({ codeHash: recoveryCodes.codeHash })
    .from(recoveryCodes)
    .where(
      and(eq(recoveryCodes.codeHash, candidateHash), isNull(recoveryCodes.usedAt)),
    )
    .limit(1);
  if (!row) throw new RecoveryError("That recovery code is not usable.");

  // Redundant next to the indexed lookup, but it keeps the comparison itself
  // constant time rather than relying on the database's.
  const supplied = Buffer.from(candidateHash);
  const stored = Buffer.from(row.codeHash);
  if (supplied.length !== stored.length || !timingSafeEqual(supplied, stored)) {
    throw new RecoveryError("That recovery code is not usable.");
  }

  const credential = newUserSessionCredential();
  const recovered = await database.execute<{ participant_id: string }>(sql`
    with candidate as (
      select
        recovery_code.id as recovery_code_id,
        recovery_code.user_id,
        participant.id as participant_id
      from recovery_codes as recovery_code
      join participants as participant
        on participant.user_id = recovery_code.user_id
       and participant.withdrawn_at is null
      where recovery_code.code_hash = ${candidateHash}
        and recovery_code.used_at is null
      order by participant.created_at desc
      limit 1
    ), consumed as (
      update recovery_codes as recovery_code
      set used_at = now()
      from candidate
      where recovery_code.id = candidate.recovery_code_id
        and recovery_code.used_at is null
      returning candidate.user_id, candidate.participant_id
    ), session_created as (
      insert into user_sessions (
        user_id,
        participant_id,
        token_hash,
        expires_at
      )
      select
        user_id,
        participant_id,
        ${credential.tokenHash},
        ${credential.expiresAt}
      from consumed
      returning user_id, participant_id
    ), audit_created as (
      insert into audit_events (
        participant_id,
        actor_type,
        action,
        entity_type,
        entity_id,
        metadata
      )
      select
        participant_id,
        'participant',
        'recovery_code.redeemed',
        'sylla_user',
        user_id::text,
        '{}'::jsonb
      from session_created
      returning participant_id
    )
    select participant_id from audit_created
  `);
  const participantId = recovered.rows[0]?.participant_id;
  if (!participantId) {
    throw new RecoveryError("That recovery code was already used.");
  }
  return { participant: { id: participantId }, token: credential.token };
}
