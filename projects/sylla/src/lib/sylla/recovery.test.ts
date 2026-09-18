import { describe, expect, it } from "vitest";

import { normalize } from "./recovery";

describe("recovery codes", () => {
  it("accepts a code the way someone would write it down and read it back", () => {
    expect(normalize("k7qf-m1ra-p2wz")).toBe("K7QFM1RAP2WZ");
    expect(normalize("K7QF M1RA P2WZ")).toBe("K7QFM1RAP2WZ");
  });

  it("forgives the characters Crockford base32 leaves out", () => {
    // Someone reading a code aloud says "oh" and "eye"; storage only ever
    // holds 0 and 1, so both spellings must land on the same code.
    expect(normalize("OIL0-K7QF-P2WZ")).toBe(normalize("0110-K7QF-P2WZ"));
    expect(normalize("UUUU-K7QF-P2WZ")).toBe(normalize("VVVV-K7QF-P2WZ"));
  });
});
