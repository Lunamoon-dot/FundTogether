export function vnextSaltStorageKey(reviewCaseId: string, courtId: bigint, judge: string): string {
  return `vnext:judge-salt:31339:${reviewCaseId.toLowerCase()}:${courtId.toString()}:${judge.toLowerCase()}`;
}

const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;

export type VNextJudgeVote = 'PASS' | 'FAIL';
export type VNextJudgeSecret = { salt: string; vote: VNextJudgeVote };

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function saveVNextJudgeSecret(key: string, secret: VNextJudgeSecret): void {
  if (!bytes32Pattern.test(secret.salt)) return;
  storage()?.setItem(key, JSON.stringify(secret));
}

export function loadVNextJudgeSecret(key: string): VNextJudgeSecret {
  const value = storage()?.getItem(key) ?? '';
  if (bytes32Pattern.test(value)) return { salt: value, vote: 'PASS' };
  try {
    const parsed = JSON.parse(value) as Partial<VNextJudgeSecret>;
    if (typeof parsed.salt === 'string' && bytes32Pattern.test(parsed.salt) && (parsed.vote === 'PASS' || parsed.vote === 'FAIL')) {
      return { salt: parsed.salt, vote: parsed.vote };
    }
  } catch {
    // Ignore malformed local storage and start with a fresh secret.
  }
  return { salt: '', vote: 'PASS' };
}
