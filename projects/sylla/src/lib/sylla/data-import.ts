import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

/**
 * First-party archive import.
 *
 * The participant downloads their own export from LinkedIn or X and hands it
 * to Sylla. Nothing here reads a third party, circumvents an access control,
 * or touches a platform's servers: the data already belongs to the person
 * giving it, which is why this is the path we build rather than scraping.
 *
 * Everything produced is a *pending, private* proposal. Import proposes;
 * the human decides what survives and what may ever be shared.
 */

export const IMPORT_MAX_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 400;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
/** Total decompressed bytes across the whole archive. */
const MAX_TOTAL_INFLATED_BYTES = 64 * 1024 * 1024;
/** A review queue longer than this stops being a review and becomes a chore. */
const MAX_CLAIMS = 40;

export class DataImportError extends Error {}

export type ImportPlatform = "linkedin" | "x";

export type ImportedClaim = {
  claim: string;
  origin: "told_to_me" | "observed";
  confidence: "high" | "medium" | "low";
  evidenceExcerpt: string | null;
};

export type ParsedArchive = {
  platform: ImportPlatform;
  digest: string;
  /** What Sylla actually read, so the participant can check the claim against it. */
  filesRead: string[];
  claims: ImportedClaim[];
};

/* -------------------------------------------------------------------------- */
/* ZIP                                                                         */
/* -------------------------------------------------------------------------- */

type ZipEntry = { name: string; read: () => Buffer };

/**
 * A running budget across one archive.
 *
 * The central directory is written by whoever made the file, so
 * `uncompressedSize` is a claim, not a fact. A zip bomb declares a small size
 * and inflates to gigabytes. Every read is therefore bounded twice: the
 * decompressor is capped up front, and what it actually produced is counted
 * against a whole-archive budget afterwards.
 */
class InflationBudget {
  private used = 0;

  spend(bytes: number) {
    this.used += bytes;
    if (this.used > MAX_TOTAL_INFLATED_BYTES) {
      throw new DataImportError(
        "That archive expands to more data than Sylla will read.",
      );
    }
  }
}

/**
 * Minimal ZIP reader over the central directory, supporting stored and
 * deflated entries — which is all LinkedIn and X exports use. Written against
 * node:zlib so an archive import needs no new dependency.
 */
export function readZip(buffer: Buffer): ZipEntry[] {
  const budget = new InflationBudget();
  // The end-of-central-directory record is at the tail, after an optional
  // comment, so scan backwards for its signature.
  let end = -1;
  for (let index = buffer.length - 22; index >= 0 && index > buffer.length - 65_557; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new DataImportError("That file is not a valid .zip archive.");

  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES) {
    throw new DataImportError("That archive contains more files than Sylla will read.");
  }

  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    // Reject traversal outright rather than normalising it away.
    if (name.includes("..") || name.startsWith("/")) continue;
    if (name.endsWith("/") || uncompressedSize > MAX_ENTRY_BYTES) continue;

    entries.push({
      name,
      read: () => {
        if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
          throw new DataImportError("That archive is damaged.");
        }
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const raw = buffer.subarray(start, start + compressedSize);
        if (method === 0) {
          budget.spend(raw.length);
          return Buffer.from(raw);
        }
        if (method === 8) {
          // Cap the decompressor itself rather than trusting the declared
          // size, then charge what it actually produced to the budget.
          let inflated: Buffer;
          try {
            inflated = inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
          } catch {
            throw new DataImportError(
              "One file in that archive expands beyond what Sylla will read.",
            );
          }
          budget.spend(inflated.length);
          return inflated;
        }
        throw new DataImportError("That archive uses an unsupported compression method.");
      },
    });
  }
  return entries;
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/** RFC 4180 enough for platform exports: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  // LinkedIn prefixes some CSVs with a single-cell notice line before the real
  // header. Only skip one when a later row is actually wider, or a genuinely
  // single-column file like Skills.csv loses its header.
  const widest = rows.reduce((max, row) => Math.max(max, row.length), 0);
  while (rows.length > 1 && rows[0].length < widest && rows[0].length < 2) {
    rows.shift();
  }
  const header = rows.shift();
  if (!header) return [];

  return rows
    .filter((values) => values.some((value) => value.trim().length))
    .map((values) =>
      Object.fromEntries(
        header.map((key, position) => [key.trim(), (values[position] ?? "").trim()]),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                  */
/* -------------------------------------------------------------------------- */

function claim(
  text: string,
  origin: ImportedClaim["origin"],
  confidence: ImportedClaim["confidence"],
  evidence: string | null = null,
): ImportedClaim {
  return {
    claim: text.replace(/\s+/g, " ").trim().slice(0, 280),
    origin,
    confidence,
    evidenceExcerpt: evidence?.replace(/\s+/g, " ").trim().slice(0, 400) ?? null,
  };
}

function findEntry(entries: ZipEntry[], suffix: string) {
  const wanted = suffix.toLowerCase();
  return entries.find((entry) => entry.name.toLowerCase().endsWith(wanted));
}

function readCsv(entries: ZipEntry[], suffix: string) {
  const entry = findEntry(entries, suffix);
  if (!entry) return null;
  return { name: entry.name, rows: parseCsv(entry.read().toString("utf8")) };
}

function extractLinkedIn(entries: ZipEntry[]) {
  const claims: ImportedClaim[] = [];
  const filesRead: string[] = [];

  const profile = readCsv(entries, "Profile.csv");
  if (profile?.rows.length) {
    filesRead.push(profile.name);
    const row = profile.rows[0];
    const headline = row["Headline"];
    const summary = row["Summary"];
    const industry = row["Industry"];
    const location = row["Geo Location"] ?? row["Location"];
    if (headline) {
      claims.push(claim(`Describes themselves as: ${headline}`, "told_to_me", "high", headline));
    }
    if (industry) claims.push(claim(`Works in ${industry}.`, "told_to_me", "high", industry));
    if (location) claims.push(claim(`Based in ${location}.`, "told_to_me", "medium", location));
    if (summary) {
      // The summary is the participant's own words about themselves, so it is
      // told_to_me rather than an inference — but it is long, so keep the
      // claim short and hold the original as evidence.
      claims.push(
        claim(
          `Summarizes their own work as: ${summary.slice(0, 180)}`,
          "told_to_me",
          "high",
          summary,
        ),
      );
    }
  }

  const positions = readCsv(entries, "Positions.csv");
  if (positions?.rows.length) {
    filesRead.push(positions.name);
    for (const row of positions.rows.slice(0, 8)) {
      const title = row["Title"];
      const company = row["Company Name"];
      if (!title && !company) continue;
      const started = row["Started On"];
      const finished = row["Finished On"];
      const span = finished ? `${started} to ${finished}` : started ? `since ${started}` : "";
      claims.push(
        claim(
          [title, company && `at ${company}`, span].filter(Boolean).join(" "),
          "told_to_me",
          finished ? "high" : "medium",
          row["Description"] || null,
        ),
      );
    }
  }

  const education = readCsv(entries, "Education.csv");
  if (education?.rows.length) {
    filesRead.push(education.name);
    for (const row of education.rows.slice(0, 4)) {
      const school = row["School Name"];
      if (!school) continue;
      const degree = row["Degree Name"];
      claims.push(
        claim(
          [degree && `Studied ${degree}`, `at ${school}`].filter(Boolean).join(" "),
          "told_to_me",
          "high",
        ),
      );
    }
  }

  const skills = readCsv(entries, "Skills.csv");
  if (skills?.rows.length) {
    filesRead.push(skills.name);
    const names = skills.rows
      .map((row) => row["Name"])
      .filter(Boolean)
      .slice(0, 12);
    if (names.length) {
      // Self-listed skills are a claim about themselves, not evidence of
      // ability, so they stay medium confidence.
      claims.push(
        claim(`Lists these skills: ${names.join(", ")}.`, "told_to_me", "medium", names.join(", ")),
      );
    }
  }

  return { claims, filesRead };
}

/** X wraps each export file as `window.YTD.x.part0 = [...]`. */
function readXPayload(entries: ZipEntry[], suffix: string) {
  const entry = findEntry(entries, suffix);
  if (!entry) return null;
  const text = entry.read().toString("utf8");
  const start = text.indexOf("=");
  if (start < 0) return null;
  try {
    return { name: entry.name, value: JSON.parse(text.slice(start + 1).trim()) as unknown };
  } catch {
    return null;
  }
}

function extractX(entries: ZipEntry[]) {
  const claims: ImportedClaim[] = [];
  const filesRead: string[] = [];

  const profile = readXPayload(entries, "profile.js");
  const record = Array.isArray(profile?.value)
    ? (profile?.value[0] as { profile?: { description?: Record<string, string> } })
    : null;
  const description = record?.profile?.description;
  if (profile && description) {
    filesRead.push(profile.name);
    if (description.bio) {
      claims.push(claim(`Their X bio reads: ${description.bio}`, "told_to_me", "high", description.bio));
    }
    if (description.location) {
      claims.push(claim(`Lists their location as ${description.location}.`, "told_to_me", "medium"));
    }
    if (description.website) {
      claims.push(claim(`Links to ${description.website} from their profile.`, "told_to_me", "medium"));
    }
  }

  const account = readXPayload(entries, "account.js");
  const accountRecord = Array.isArray(account?.value)
    ? (account?.value[0] as { account?: { username?: string; createdAt?: string } })
    : null;
  if (account && accountRecord?.account?.username) {
    filesRead.push(account.name);
    const created = accountRecord.account.createdAt;
    claims.push(
      claim(
        `Uses the X handle @${accountRecord.account.username}${
          created ? `, held since ${created.slice(0, 10)}` : ""
        }.`,
        "told_to_me",
        "high",
      ),
    );
  }

  return { claims, filesRead };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function detectPlatform(entries: ZipEntry[]): ImportPlatform | null {
  if (findEntry(entries, "Profile.csv") || findEntry(entries, "Positions.csv")) {
    return "linkedin";
  }
  if (findEntry(entries, "profile.js") || findEntry(entries, "account.js")) return "x";
  return null;
}

export function parseArchive(buffer: Buffer): ParsedArchive {
  if (!buffer.length) throw new DataImportError("That file is empty.");
  if (buffer.length > IMPORT_MAX_BYTES) {
    throw new DataImportError("That archive is larger than Sylla will read.");
  }

  const entries = readZip(buffer);
  const platform = detectPlatform(entries);
  if (!platform) {
    throw new DataImportError(
      "Sylla did not recognize that archive. Drop the .zip LinkedIn or X gave you, unchanged.",
    );
  }

  const { claims, filesRead } =
    platform === "linkedin" ? extractLinkedIn(entries) : extractX(entries);
  if (!claims.length) {
    throw new DataImportError(
      "Sylla read that archive but found nothing it could turn into a memory to review.",
    );
  }

  return {
    platform,
    digest: createHash("sha256").update(buffer).digest("hex"),
    filesRead,
    claims: claims.slice(0, MAX_CLAIMS),
  };
}
