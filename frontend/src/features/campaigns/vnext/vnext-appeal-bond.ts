export function vnextAppealBondApprovalRequired(allowance: bigint, bond: bigint): boolean {
  return bond > 0n && allowance < bond;
}
