import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('Judge workspace exposes assigned publication cases and votes', () => {
  const source = read('src/features/campaigns/judge/JudgeConsole.tsx');
  assert.match(source, /campaignApi\.operations\('judge'/);
  assert.match(source, /votePublicationCase/);
  assert.match(source, /expirePublicationCase/);
});

test('creator publication flow creates a Judge case before createCampaign', () => {
  const source = read('src/features/campaigns/judge/JudgePublicationPanel.tsx');
  assert.match(source, /createPublicationCase/);
  assert.doesNotMatch(source, /approveCampaign/);
});

test('creator Studio no longer blocks draft creation on Studio verification', () => {
  const source = read('src/features/campaigns/creator/Studio.tsx');
  assert.doesNotMatch(source, /profile\?\.status !== 'VERIFIED'/);
  assert.match(source, /JudgePublicationPanel/);
});

test('transaction recovery no longer records the fixed approveCampaign action', () => {
  const source = read('src/features/campaigns/transactions/useTransaction.ts');
  assert.doesNotMatch(source, /approveCampaign/);
  assert.match(source, /createPublicationCase/);
});
