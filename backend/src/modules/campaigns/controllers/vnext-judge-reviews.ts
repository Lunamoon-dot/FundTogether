type JudgeReviewRow = {
  reviewCaseId: string;
  finalized: boolean;
  [key: string]: unknown;
};

type JudgeAssignmentRow = {
  reviewCaseId: string;
  judgeAddress: string;
  [key: string]: unknown;
};

export function buildVNextJudgeReviews<Review extends JudgeReviewRow, Assignment extends JudgeAssignmentRow>(
  reviews: Review[],
  assignments: Assignment[],
  walletAddresses: string[],
): Array<Review & { assignments: Assignment[] }> {
  const wallets = new Set(walletAddresses.map(wallet => wallet.toLowerCase()));
  return reviews
    .filter(review => !review.finalized)
    .map(review => ({
      ...review,
      assignments: assignments.filter(assignment => (
        assignment.reviewCaseId === review.reviewCaseId
        && wallets.has(assignment.judgeAddress.toLowerCase())
      )),
    }));
}
