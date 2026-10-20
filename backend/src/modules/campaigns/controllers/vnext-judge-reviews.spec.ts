import { describe, expect, it } from "@jest/globals";
import { buildVNextJudgeReviews } from "./vnext-judge-reviews";

const review = (reviewCaseId: string, finalized = false) => ({
  reviewCaseId,
  finalized,
  campaignId: "7",
});

const assignment = (reviewCaseId: string, judgeAddress: string) => ({
  reviewCaseId,
  judgeAddress,
  courtId: "0",
  slot: 0,
});

describe("VNext Judge review discovery", () => {
  it("includes active enrollment cases before CourtAssigned and keeps only the current wallet assignment", () => {
    const rows = buildVNextJudgeReviews(
      [review("0xopen"), review("0xassigned"), review("0xclosed", true)],
      [assignment("0xassigned", "0xJUDGE"), assignment("0xassigned", "0xOTHER")],
      ["0xjudge"],
    );

    expect(rows.map(row => row.reviewCaseId)).toEqual(["0xopen", "0xassigned"]);
    expect(rows[0].assignments).toEqual([]);
    expect(rows[1].assignments).toEqual([expect.objectContaining({ judgeAddress: "0xJUDGE" })]);
  });
});
