export type EditionsPreparationTextFields = {
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
};

const rules: Array<[keyof EditionsPreparationTextFields, string]> = [
  ['contentOutline', 'Nội dung PDF cần ít nhất 20 ký tự.'],
  ['budgetPlan', 'Ngân sách cần ít nhất 20 ký tự.'],
  ['evidencePlan', 'Bằng chứng tiến độ cần ít nhất 20 ký tự.'],
];

export function getEditionsPreparationFieldError(field: keyof EditionsPreparationTextFields, value: string): string | undefined {
  const rule = rules.find(([name]) => name === field);
  return rule && value.trim().length < 20 ? rule[1] : undefined;
}

export function getEditionsPreparationRequiredFieldError(payoutWalletLinkId: string, end: string): string | undefined {
  if (!payoutWalletLinkId.trim()) return 'Chọn ví nhận tiền đã xác minh trước khi lưu hồ sơ.';
  if (!end.trim()) return 'Chọn hạn cam kết phát hành PDF trước khi lưu hồ sơ.';
  return undefined;
}

export function getDefaultPayoutWalletLinkId(currentId: string, wallets: Array<{ id: string }>): string {
  return currentId || (wallets.length === 1 ? wallets[0].id : '');
}

export function getPreparationAction(hasSavedPreparation: boolean, dirty: boolean): 'SAVE' | 'LOCK' {
  return hasSavedPreparation && !dirty ? 'LOCK' : 'SAVE';
}

export function validateEditionsPreparation(fields: EditionsPreparationTextFields): Partial<Record<keyof EditionsPreparationTextFields, string>> {
  return Object.fromEntries(rules
    .map(([field]) => [field, getEditionsPreparationFieldError(field, fields[field])] as const)
    .filter(([, error]) => error)) as Partial<Record<keyof EditionsPreparationTextFields, string>>;
}
