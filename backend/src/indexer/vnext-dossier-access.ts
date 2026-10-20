export type VNextDossierAccess = "CREATOR" | "JUDGE" | "CHALLENGER";

export type VNextDossierReview = {
  creator: string;
  challenger?: string;
  assignments: Array<{ judgeAddress: string }>;
};

export function resolveVNextDossierAccess(
  review: VNextDossierReview,
  walletAddresses: readonly string[],
): VNextDossierAccess | null {
  const wallets = new Set(walletAddresses.map(address => address.toLowerCase()));
  if (wallets.has(review.creator.toLowerCase())) return "CREATOR";
  if (review.assignments.some(assignment => wallets.has(assignment.judgeAddress.toLowerCase()))) return "JUDGE";
  if (review.challenger && wallets.has(review.challenger.toLowerCase())) return "CHALLENGER";
  return null;
}
