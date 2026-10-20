import { describe, expect, it } from "@jest/globals";
import { resolveVNextDossierAccess } from "./vnext-dossier-access";

const review = {
  creator: "0x1111111111111111111111111111111111111111",
  challenger: "0x4444444444444444444444444444444444444444",
  assignments: [{ judgeAddress: "0x2222222222222222222222222222222222222222" }],
};

describe("VNext dossier access", () => {
  it("allows the canonical creator wallet", () => {
    expect(resolveVNextDossierAccess(review, [review.creator.toUpperCase()])).toBe("CREATOR");
  });

  it("allows an assigned Judge wallet", () => {
    expect(resolveVNextDossierAccess(review, [review.assignments[0].judgeAddress])).toBe("JUDGE");
  });

  it("denies an unrelated wallet", () => {
    expect(resolveVNextDossierAccess(review, ["0x3333333333333333333333333333333333333333"])).toBeNull();
  });

  it("allows the canonical challenger wallet", () => {
    expect(resolveVNextDossierAccess(review, [review.challenger])).toBe("CHALLENGER");
  });

  it("does not grant access from an empty wallet list", () => {
    expect(resolveVNextDossierAccess(review, [])).toBeNull();
  });
});
