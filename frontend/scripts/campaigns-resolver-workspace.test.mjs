import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createServer } from 'vite';

const root = new URL('../src/features/', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' });
after(() => server.close());
const { ResolverCampaignActions } = await server.ssrLoadModule('/src/features/campaigns/resolver/CampaignActions.tsx');

function renderResolverProduction(snapshot) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const resolver = '0x1111111111111111111111111111111111111111';
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(ResolverCampaignActions, {
    campaignId: 'campaign',
    userId: 'resolver-user',
    chain: {
      status: 'ON_CHAIN_CONFIRMED',
      onchainCampaignId: '0',
      chainTimestamp: '1790000000',
      challenges: [],
      deployment: { resolver, backupResolver: resolver },
      snapshot,
    },
    evidence: [],
    transaction: { address: resolver, busy: false, transaction: null, error: '', notice: '', send: async () => {} },
    busy: false,
    section: 'production',
    onRefresh: () => {},
    onActivate: () => {},
    onReconcile: () => {},
  })));
  client.clear();
  return html;
}

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
  assert.match(actions, /section === 'production'[\s\S]*DisbursementPanel/);
  assert.match(actions, /id="resolver-focus-disputes"/);
  assert.match(read('campaigns/shared/ui/DisbursementPanel.tsx'), /id="resolver-focus-disbursement"/);
  assert.match(page, /id="resolver-focus-decisions"/);
  assert.doesNotMatch(actions, /\n    <DisbursementPanel/);
  assert.doesNotMatch(page, /PledgePreflight|claimSurplus|createPayoutRequest|createCompletionRequest/);
  assert.match(page, /InternalCampaignFrame/);
  assert.doesNotMatch(page, /CampaignDetailFrame|CampaignOverview|CampaignLedger/);
});

test('resolver queue and route use the canonical resolver workspace', () => {
  const area = read('explore/PublicArea.tsx');
  const consoleSource = read('campaigns/resolver/Console.tsx');
  assert.match(area, /ResolverCampaignReviewPage/);
  assert.match(area, /campaignDetail\.workspace === 'resolver'/);
  assert.match(area, /hasResolverRole/);
  assert.match(consoleSource, /campaignDetailHref\('resolver'/);
});

test('resolver workspace keeps pre-activation commitment signing reachable', () => {
  const actions = read('campaigns/resolver/CampaignActions.tsx');

  assert.match(actions, /section === 'overview'/);
  assert.match(actions, /chain\.status === 'NOT_PUBLISHED' \|\| chain\.status === 'ORPHANED'/);
  assert.match(actions, /<ActivationPanel/);
  assert.match(actions, /transaction\.transaction\?\.action === 'approveCampaign'/);
});

test('resolver activation follows the Campaign contract approveCampaign ABI order', () => {
  const page = read('campaigns/resolver/CampaignReviewPage.tsx');

  assert.match(page, /tx\.send\('approveCampaign', \[result\.data\.creatorWallet, result\.data\.commitmentHash, BigInt\(result\.data\.goal\), BigInt\(result\.data\.price\), BigInt\(result\.data\.fundingDuration\)\]/);
});

test('resolver sees why no review action exists after creator commits the PDF deadline', () => {
  const html = renderResolverProduction({
    state: 1,
    creator: '0x2222222222222222222222222222222222222222',
    goal: '100000000',
    raised: '240000000',
    escrowed: '140000000',
    creatorPaid: '100000000',
    fundingDeadline: '1780000000',
    releaseDeadline: '1802303999',
    disputeDeadline: '0',
    challengeDeadline: '0',
    openDisputes: '0',
    productionApproved: true,
    productionHash: `0x${'1'.repeat(64)}`,
    pdfHash: `0x${'0'.repeat(64)}`,
    releaseEvidenceHash: `0x${'0'.repeat(64)}`,
  });

  assert.match(html, /Đang chờ Creator gửi PDF cuối/);
  assert.match(html, /chưa có quyết định nào cần Resolver ký/);
  assert.doesNotMatch(html, />Duyệt PDF cuối</);
});

test('creator activation follows the Campaign contract createCampaign ABI order', () => {
  const page = read('campaigns/creator/CampaignWorkspacePage.tsx');

  assert.match(page, /tx\.send\('createCampaign', \[result\.data\.commitmentHash, BigInt\(result\.data\.goal\), BigInt\(result\.data\.price\), BigInt\(result\.data\.fundingDuration\)\]/);
});
