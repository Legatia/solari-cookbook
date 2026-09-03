import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  DataImportError,
  detectPlatform,
  parseArchive,
  parseCsv,
  readZip,
} from "./data-import";

/** Build a real ZIP so the reader is tested against bytes, not a stub. */
function makeZip(files: Array<{ name: string; body: string; store?: boolean }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.body, "utf8");
    const stored = file.store === true;
    const data = stored ? raw : deflateRawSync(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(stored ? 0 : 8, 10);
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

const LINKEDIN_PROFILE = `First Name,Last Name,Headline,Summary,Industry,Geo Location
Tobias,Example,"Builds portable agent infrastructure","I care about software that people can leave.",Software Development,"Berlin, Germany"`;

const LINKEDIN_POSITIONS = `Company Name,Title,Description,Started On,Finished On
Infinity Team,Founder,"Personal agent infrastructure",Jan 2024,
Older Corp,Engineer,,Jan 2019,Dec 2023`;

describe("zip reading", () => {
  it("reads deflated and stored entries", () => {
    const entries = readZip(
      makeZip([
        { name: "a.txt", body: "deflated content here" },
        { name: "b.txt", body: "stored content here", store: true },
      ]),
    );
    expect(entries.map((entry) => entry.name)).toEqual(["a.txt", "b.txt"]);
    expect(entries[0].read().toString()).toBe("deflated content here");
    expect(entries[1].read().toString()).toBe("stored content here");
  });

  it("refuses something that is not an archive", () => {
    expect(() => readZip(Buffer.from("not a zip"))).toThrow(DataImportError);
  });

  it("drops traversal entries instead of normalizing them", () => {
    const entries = readZip(
      makeZip([
        { name: "../escape.csv", body: "x" },
        { name: "/absolute.csv", body: "x" },
        { name: "safe.csv", body: "x" },
      ]),
    );
    expect(entries.map((entry) => entry.name)).toEqual(["safe.csv"]);
  });
});

describe("csv parsing", () => {
  it("handles quoted fields, commas inside quotes, and escaped quotes", () => {
    const rows = parseCsv('A,B\n"one, two","say ""hi"""\n');
    expect(rows).toEqual([{ A: "one, two", B: 'say "hi"' }]);
  });

  it("skips a notice line before the real header", () => {
    const rows = parseCsv('Notes about this file\nName,Value\nskill,high\n');
    expect(rows).toEqual([{ Name: "skill", Value: "high" }]);
  });
});

describe("platform detection", () => {
  it("recognizes a LinkedIn export", () => {
    const entries = readZip(makeZip([{ name: "Profile.csv", body: LINKEDIN_PROFILE }]));
    expect(detectPlatform(entries)).toBe("linkedin");
  });

  it("recognizes an X archive", () => {
    const entries = readZip(
      makeZip([{ name: "data/account.js", body: "window.YTD.account.part0 = []" }]),
    );
    expect(detectPlatform(entries)).toBe("x");
  });

  it("refuses an unrelated archive rather than guessing", () => {
    expect(() =>
      parseArchive(makeZip([{ name: "holiday.txt", body: "photos" }])),
    ).toThrow(DataImportError);
  });
});

describe("LinkedIn extraction", () => {
  const archive = parseArchive(
    makeZip([
      { name: "Profile.csv", body: LINKEDIN_PROFILE },
      { name: "Positions.csv", body: LINKEDIN_POSITIONS },
      { name: "Skills.csv", body: "Name\nTypeScript\nProduct design" },
    ]),
  );

  it("reads only the files it declares", () => {
    expect(archive.platform).toBe("linkedin");
    expect(archive.filesRead).toEqual(["Profile.csv", "Positions.csv", "Skills.csv"]);
  });

  it("treats the participant's own profile as something they told Sylla", () => {
    // Nothing in an export is an inference: the person wrote all of it.
    expect(archive.claims.every((item) => item.origin === "told_to_me")).toBe(true);
  });

  it("keeps the original text as evidence beside the claim", () => {
    const headline = archive.claims.find((item) => item.claim.includes("Builds portable"));
    expect(headline?.evidenceExcerpt).toContain("Builds portable agent infrastructure");
  });

  it("holds a current role less firmly than a finished one", () => {
    const current = archive.claims.find((item) => item.claim.includes("Infinity Team"));
    const past = archive.claims.find((item) => item.claim.includes("Older Corp"));
    expect(current?.confidence).toBe("medium");
    expect(past?.confidence).toBe("high");
  });

  it("marks self-listed skills as a claim, not proof of ability", () => {
    const skills = archive.claims.find((item) => item.claim.startsWith("Lists these skills"));
    expect(skills?.confidence).toBe("medium");
  });

  it("hashes the archive so the same file cannot import twice", () => {
    expect(archive.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("X extraction", () => {
  it("reads the bio and handle from the wrapped payloads", () => {
    const archive = parseArchive(
      makeZip([
        {
          name: "data/profile.js",
          body:
            'window.YTD.profile.part0 = [{"profile":{"description":{"bio":"Building agent infrastructure","location":"Berlin","website":"https://example.com"}}}]',
        },
        {
          name: "data/account.js",
          body:
            'window.YTD.account.part0 = [{"account":{"username":"example","createdAt":"2015-03-04T10:00:00.000Z"}}]',
        },
      ]),
    );
    expect(archive.platform).toBe("x");
    expect(archive.claims.some((item) => item.claim.includes("Building agent infrastructure"))).toBe(
      true,
    );
    expect(archive.claims.some((item) => item.claim.includes("@example"))).toBe(true);
  });
});
