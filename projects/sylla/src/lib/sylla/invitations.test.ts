import { describe, expect, it } from "vitest";

import { normalizeInvitationCode } from "./invitations";

describe("invitation codes", () => {
  it("accepts a code the way someone reads it down a phone", () => {
    expect(normalizeInvitationCode("k7qf-m1ra-p2wz")).toBe("K7QFM1RAP2WZ");
    expect(normalizeInvitationCode("K7QF M1RA P2WZ")).toBe("K7QFM1RAP2WZ");
  });

  it("forgives the characters Crockford base32 leaves out", () => {
    // The point of a spoken code is that "oh" and "zero" cannot diverge.
    expect(normalizeInvitationCode("OIL0-K7QF-P2WZ")).toBe(
      normalizeInvitationCode("0110-K7QF-P2WZ"),
    );
    expect(normalizeInvitationCode("UUUU-K7QF-P2WZ")).toBe(
      normalizeInvitationCode("VVVV-K7QF-P2WZ"),
    );
  });
});
