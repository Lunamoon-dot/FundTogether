import { describe, expect, it } from "@jest/globals";
import { matchesVNextEvidenceHash, vnextEvidenceSha256 } from "./vnext-evidence-integrity";

describe("VNext evidence integrity", () => {
  it("derives the canonical SHA-256 token hash", () => {
    const hash = vnextEvidenceSha256(Buffer.from("fundtogether-evidence"));
    expect(hash).toBe("0xf2127d4fa806c99b621f2c2dd8bc5daf12b406c2960ac2b3bff3a5fe848313a1");
  });

  it("rejects bytes that do not match the canonical evidence hash", () => {
    const expected = vnextEvidenceSha256(Buffer.from("expected"));
    expect(matchesVNextEvidenceHash(Buffer.from("different"), expected)).toBe(false);
  });

  it("accepts case-insensitive hash representation", () => {
    const expected = vnextEvidenceSha256(Buffer.from("same")).toUpperCase();
    expect(matchesVNextEvidenceHash(Buffer.from("same"), expected)).toBe(true);
  });
});
