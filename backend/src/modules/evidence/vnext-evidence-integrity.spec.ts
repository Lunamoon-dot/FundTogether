import { assertEvidenceMatches, sha256Hex } from "./vnext-evidence-integrity";

describe("VNext evidence integrity", () => {
  it("uses the exact immutable byte hash", () => {
    const bytes = Buffer.from("milestone evidence", "utf8");
    const hash = sha256Hex(bytes);
    expect(assertEvidenceMatches(hash, bytes)).toBe(hash);
  });

  it("fails closed on mismatch and malformed hashes", () => {
    expect(() => assertEvidenceMatches(`0x${"0".repeat(64)}`, Buffer.from("different"))).toThrow("Evidence integrity mismatch");
    expect(() => assertEvidenceMatches("not-a-hash", Buffer.from("different"))).toThrow("Evidence integrity mismatch");
  });
});
