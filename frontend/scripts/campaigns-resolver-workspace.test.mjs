import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../src/features/', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('resolver workspace owns the private review boundary and resolver-only actions', () => {
  const page = read('campaigns/resolver/CampaignReviewPage.tsx');
  const actions = read('campaigns/resolver/CampaignActions.tsx');

  assert.match(page, /campaignApi\.operations\('resolver'/);
  assert.match(page, /campaignId === id/);
  assert.match(page, /campaignApi\.evidence\(id, true/);
  assert.match(page, /ReviewThread/);
  assert.match(actions, /ActivationPanel/);
  assert.match(actions, /DisbursementPanel/);
  assert.match(actions, /CompletionSettlementPanel/);
  assert.match(actions, /finalizeFunding/);
  assert.match(actions, /startRefunds/);
  assert.match(actions, /reviewRelease/);
  assert.match(actions, /reviewProduction/);
  assert.match(actions, /resolveChallenge/);
  assert.match(actions, /DisbursementPanel/);
  assert.doesNotMatch(page, /PledgePreflight|claimSurplus|createPayoutRequest|createCompletionRequest/);
});

test('resolver queue and route use the canonical resolver workspace', () => {
  const area = read('explore/PublicArea.tsx');
  const consoleSource = read('campaigns/resolver/Console.tsx');
  assert.match(area, /ResolverCampaignReviewPage/);
  assert.match(area, /campaignDetail\.workspace === 'resolver'/);
  assert.match(area, /hasResolverRole/);
  assert.match(consoleSource, /campaignDetailHref\('resolver'/);
});
