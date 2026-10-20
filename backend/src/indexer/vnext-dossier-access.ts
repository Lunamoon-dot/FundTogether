export type VNextDossierAccess = "CREATOR" | "JUDGE";

export type VNextDossierReview = {
  creator: string;
  assignments: Array<{ judgeAddress: string }>;
};

export function resolveVNextDossierAccess(
  review: VNextDossierReview,
  walletAddresses: readonly string[],
): VNextDossierAccess | null {
  const wallets = new Set(walletAddresses.map(address => address.toLowerCase()));
  if (wallets.has(review.creator.toLowerCase())) return "CREATOR";
  if (review.assignments.some(assignment => wallets.has(assignment.judgeAddress.toLowerCase()))) return "JUDGE";
  return null;
}
