export type PreparationTextFields = {
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
};

const rules: Array<[keyof PreparationTextFields, string]> = [
  ['contentOutline', 'Nội dung PDF cần ít nhất 20 ký tự.'],
  ['budgetPlan', 'Ngân sách cần ít nhất 20 ký tự.'],
  ['evidencePlan', 'Bằng chứng tiến độ cần ít nhất 20 ký tự.'],
];

export function getPreparationFieldError(field: keyof PreparationTextFields, value: string): string | undefined {
  const rule = rules.find(([name]) => name === field);
  return rule && value.trim().length < 20 ? rule[1] : undefined;
}

export function getPreparationRequiredFieldError(payoutWalletLinkId: string): string | undefined {
  if (!payoutWalletLinkId.trim()) return 'Cần chọn một ví Creator đã liên kết trên chain 31339.';
  return undefined;
}

export function getDefaultPayoutWalletLinkId(currentId: string, wallets: Array<{ id: string }>): string {
  return currentId || (wallets.length === 1 ? wallets[0].id : '');
}

export function getPreparationAction(hasSavedPreparation: boolean, dirty: boolean): 'SAVE' | 'LOCK' {
  return hasSavedPreparation && !dirty ? 'LOCK' : 'SAVE';
}

export function validatePreparation(fields: PreparationTextFields): Partial<Record<keyof PreparationTextFields, string>> {
  return Object.fromEntries(rules
    .map(([field]) => [field, getPreparationFieldError(field, fields[field])] as const)
    .filter(([, error]) => error)) as Partial<Record<keyof PreparationTextFields, string>>;
}
