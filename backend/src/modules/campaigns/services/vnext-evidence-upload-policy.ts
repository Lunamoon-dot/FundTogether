export type VNextEvidenceUploadPolicyInput = {
  enrolledCount: bigint;
  finalized: boolean;
  existingEvidence: boolean;
  nowSeconds: bigint;
  commitDeadlineSeconds: bigint;
};

export function canUploadVNextEvidence(input: VNextEvidenceUploadPolicyInput): boolean {
  if (input.existingEvidence) return true;
  return !input.finalized && input.nowSeconds < input.commitDeadlineSeconds;
}
