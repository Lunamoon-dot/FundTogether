import { buildVNextCourtDashboard } from "./vnext-court-dashboard";

describe("VNext Court dashboard", () => {
  it("shows at most five canonical courts with assignment and finalization state", () => {
    const review = { reviewCaseId: "case-1", roundId: "2", courtCount: "6" };
    const assignments = Array.from({ length: 18 }, (_, index) => ({
      reviewCaseId: "case-1",
      courtId: Math.floor(index / 3).toString(),
      slot: index % 3,
      judgeAddress: `judge-${index}`,
      committed: index < 3,
      revealed: index < 2,
    }));
    const courts = [
      { reviewCaseId: "case-1", courtId: "0", outcome: 1, finalized: true },
      { reviewCaseId: "case-1", courtId: "1", outcome: null, finalized: false },
    ];

    const dashboard = buildVNextCourtDashboard(review, assignments, courts);

    expect(dashboard).toHaveLength(5);
    expect(dashboard[0]).toMatchObject({
      courtId: "0",
      assignmentStatus: "ASSIGNED",
      committedCount: 3,
      revealedCount: 2,
      finalized: true,
      verdict: 1,
    });
    expect(dashboard.some(court => court.courtId === "5")).toBe(false);
    expect(dashboard[1].verdict).toBeNull();
    expect(dashboard[1]).not.toHaveProperty("votes");
  });
});
