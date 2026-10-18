import type { CampaignTransactionAction } from '../api/campaigns';

export type { CampaignTransactionAction } from '../api/campaigns';

export type TransactionStage =
  | 'preflight'
  | 'awaiting_signature'
  | 'submitted'
  | 'receipt_confirmed'
  | 'indexing'
  | 'canonical'
  | 'failed';

export interface TransactionRecord {
  userId: string;
  campaignId: string;
  action: CampaignTransactionAction;
  txHash?: `0x${string}`;
  stage: TransactionStage;
  updatedAt: string;
  error?: string;
}

const STORAGE_PREFIX = 'fundtogether:campaigns-tx:v1:';
const MAX_RECORD_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function storage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

function isTransactionAction(value: unknown): value is CampaignTransactionAction {
  return typeof value === 'string' && [
    'approveCampaign', 'createCampaign', 'pledge', 'submitProduction', 'submitRelease',
    'reviewProduction', 'reviewRelease', 'challengeRelease', 'resolveChallenge',
    'finalizeFunding', 'startRefunds', 'claimRefund', 'requestCompletion', 'approveCompletion', 'rejectCompletion', 'claimSurplus', 'cancelCampaign',
  ].includes(value);
}

function isTransactionStage(value: unknown): value is TransactionStage {
  return typeof value === 'string' && [
    'preflight', 'awaiting_signature', 'submitted', 'receipt_confirmed', 'indexing', 'canonical', 'failed',
  ].includes(value);
}

function parseRecord(raw: string | null): TransactionRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TransactionRecord>;
    const updatedAtValue = value.updatedAt;
    if (typeof updatedAtValue !== 'string') return null;
    const updatedAt = Date.parse(updatedAtValue);
    if (!value.userId || !value.campaignId || !isTransactionAction(value.action) || !isTransactionStage(value.stage) || !Number.isFinite(updatedAt)) return null;
    if (Date.now() - updatedAt > MAX_RECORD_AGE_MS) return null;
    if (value.txHash !== undefined && (typeof value.txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value.txHash))) return null;
    return {
      userId: value.userId,
      campaignId: value.campaignId,
      action: value.action,
      txHash: value.txHash as `0x${string}` | undefined,
      stage: value.stage,
      updatedAt: updatedAtValue,
      error: typeof value.error === 'string' ? value.error : undefined,
    };
  } catch {
    return null;
  }
}

export function getTransactionStorageKey(userId: string, campaignId: string, action: CampaignTransactionAction): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(campaignId)}:${action}`;
}

export function loadTransaction(userId: string, campaignId: string, action: CampaignTransactionAction): TransactionRecord | null {
  const store = storage();
  if (!store) return null;
  const key = getTransactionStorageKey(userId, campaignId, action);
  const record = parseRecord(store.getItem(key));
  if (!record) {
    try { store.removeItem(key); } catch { /* storage can be unavailable in private browsing */ }
    return null;
  }
  return record.userId === userId && record.campaignId === campaignId && record.action === action ? record : null;
}

export function loadLatestTransaction(userId: string, campaignId: string): TransactionRecord | null {
  const store = storage();
  if (!store) return null;
  let latest: TransactionRecord | null = null;
  const prefix = `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(campaignId)}:`;
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) {
    if (!key?.startsWith(prefix)) continue;
    const record = parseRecord(store.getItem(key));
    if (!record) {
      try { store.removeItem(key); } catch { /* storage can be unavailable in private browsing */ }
      continue;
    }
    if (record.userId !== userId || record.campaignId !== campaignId) continue;
    if (record.stage === 'canonical') {
      try { store.removeItem(key); } catch { /* best effort */ }
      continue;
    }
    if (!latest || Date.parse(record.updatedAt) > Date.parse(latest.updatedAt)) latest = record;
  }
  return latest;
}

export function saveTransaction(record: TransactionRecord): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(getTransactionStorageKey(record.userId, record.campaignId, record.action), JSON.stringify(record));
  } catch {
    // A full or disabled browser store must not turn a confirmed blockchain action into a UI crash.
  }
}

export function clearStoredTransaction(userId: string, campaignId: string, action: CampaignTransactionAction): void {
  const store = storage();
  if (!store) return;
  try { store.removeItem(getTransactionStorageKey(userId, campaignId, action)); } catch { /* best effort */ }
}

export function clearAllTransactions(userId: string, campaignId: string): void {
  const store = storage();
  if (!store) return;
  const prefix = `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(campaignId)}:`;
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) {
    try { store.removeItem(key); } catch { /* best effort */ }
  }
}
