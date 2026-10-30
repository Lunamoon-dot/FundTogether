const MAX_COURTS_PER_REVIEW_CASE = 5n;

type ReviewRow = {
  reviewCaseId: string;
  roundId: string;
  courtCount: string;
};

type AssignmentRow = {
  reviewCaseId: string;
  courtId: string;
  slot: number;
  judgeAddress: string;
  committed: boolean;
  revealed: boolean;
};

type CourtRow = {
  reviewCaseId: string;
  courtId: string;
  outcome: number | null;
  finalized: boolean;
};

export function buildVNextCourtDashboard(
  review: ReviewRow,
  assignments: AssignmentRow[],
  courtRows: CourtRow[],
) {
  const projectedCount = BigInt(review.courtCount);
  const courtCount = Number(projectedCount > MAX_COURTS_PER_REVIEW_CASE
    ? MAX_COURTS_PER_REVIEW_CASE
    : projectedCount);

  return Array.from({ length: courtCount }, (_, courtIndex) => {
    const courtId = courtIndex.toString();
    const judges = assignments
      .filter(assignment => assignment.reviewCaseId === review.reviewCaseId && assignment.courtId === courtId)
      .sort((left, right) => left.slot - right.slot);
    const court = courtRows.find(item => item.reviewCaseId === review.reviewCaseId && item.courtId === courtId);
    const committedCount = judges.filter(judge => judge.committed).length;
    const revealedCount = judges.filter(judge => judge.revealed).length;
    const assignmentStatus = judges.length === 3 ? "ASSIGNED" : "PENDING";
    const phase = court?.finalized
      ? "FINALIZED"
      : revealedCount > 0
        ? "REVEAL"
        : committedCount > 0
          ? "COMMIT"
          : assignmentStatus === "ASSIGNED"
            ? "COMMIT_PENDING"
            : "ASSIGNMENT_PENDING";

    return {
      courtId,
      roundId: review.roundId,
      judges: judges.map(judge => judge.judgeAddress),
      assignmentStatus,
      phase,
      committedCount,
      revealedCount,
      finalized: court?.finalized ?? false,
      verdict: court?.finalized ? court.outcome : null,
    };
  });
}
