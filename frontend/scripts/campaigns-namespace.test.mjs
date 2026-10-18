import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const featuresRoot = path.join(frontendRoot, 'src', 'features');
const relative = value => path.join(featuresRoot, value);
const exists = value => fs.existsSync(relative(value));

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath];
  });
}

test('active UI lives under the campaigns namespace', () => {
  for (const directory of ['campaigns/public', 'campaigns/creator', 'campaigns/resolver', 'campaigns/backer', 'campaigns/transactions', 'campaigns/shared']) {
    assert.equal(exists(directory), true, `missing target directory: ${directory}`);
  }
  for (const file of [
    'campaigns/public/Feed.tsx',
    'campaigns/public/Page.tsx',
    'campaigns/public/Community.tsx',
    'campaigns/creator/Studio.tsx',
    'campaigns/creator/Profile.tsx',
    'campaigns/creator/PreparationForm.tsx',
    'campaigns/creator/NewPreparationForm.tsx',
    'campaigns/resolver/Console.tsx',
    'campaigns/resolver/ReviewPanel.tsx',
    'campaigns/backer/Library.tsx',
    'campaigns/transactions/useTransaction.ts',
    'campaigns/shared/FrozenTerms.tsx',
    'campaigns/historical/HistoricalEntitlements.tsx',
    'campaigns/historical/HistoricalCampaignPage.tsx',
    'campaigns/historical/HistoricalFeed.tsx',
  ]) {
    assert.equal(exists(file), true, `missing Campaign module: ${file}`);
  }
});

test('retired product branches and empty placeholders are removed', () => {
  assert.equal(exists('reward'), false, 'features/campaigns must not remain as a product branch');
  for (const directory of ['challenges', 'evidence', 'milestones', 'refunds', 'reputation']) {
    assert.equal(exists(directory), false, `empty placeholder remains: ${directory}`);
  }
});

test('current campaign files do not repeat the product namespace in filenames', () => {
  const files = listFiles(relative('campaigns')).map(file => path.basename(file));
  const allowedSharedDetailNames = new Set([
    'CampaignActions.tsx',
    'CampaignPage.tsx',
    'CampaignDetailFrame.tsx',
    'CampaignDossierList.tsx',
    'CampaignLedger.tsx',
    'CampaignOverview.tsx',
  ]);
  assert.deepEqual(
    files.filter(name => /^(?:Reward|Campaign)/.test(name) && !allowedSharedDetailNames.has(name)),
    [],
    'the campaigns folder already supplies product context',
  );
});

test('current campaign modules own their APIs and review responsibilities', () => {
  const campaignRoot = relative('campaigns');
  const historicalConsumers = new Set([
    path.normalize('historical/HistoricalEntitlements.tsx'),
    path.normalize('historical/HistoricalCampaignPage.tsx'),
    path.normalize('historical/HistoricalFeed.tsx'),
  ]);

  for (const file of listFiles(campaignRoot).filter(file => /\.[cm]?[jt]sx?$/.test(file))) {
    const source = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(campaignRoot, file);
    if (source.includes('lib/api/historical-campaigns')) {
      assert.equal(
        historicalConsumers.has(relativePath),
        true,
        `current campaign module imports the historical API outside its boundary: ${relativePath}`,
      );
    }
  }

  const campaignApiSource = fs.readFileSync(path.join(frontendRoot, 'src', 'features', 'campaigns', 'api', 'campaigns.ts'), 'utf8');
  assert.match(campaignApiSource, /const base = ['"]\/v1\/fundtogether\/campaigns['"];/, 'Campaign API must use the FundTogether public wire prefix');
  assert.equal(fs.existsSync(path.join(frontendRoot, 'src', 'lib', 'api', 'reward.ts')), false);
});

test('public workflow contracts remain stable', () => {
  const shell = fs.readFileSync(path.join(featuresRoot, 'explore', 'AppShell.tsx'), 'utf8');
  const router = fs.readFileSync(path.join(featuresRoot, 'explore', 'PublicArea.tsx'), 'utf8');
  const routeContract = fs.readFileSync(path.join(featuresRoot, 'explore', 'campaignRoutes.ts'), 'utf8');
  const campaignApiSource = fs.readFileSync(path.join(frontendRoot, 'src', 'features', 'campaigns', 'api', 'campaigns.ts'), 'utf8');
  for (const route of ['#/campaigns', '#/campaigns/review', '#/campaigns/creator', '#/campaigns/creator/profile', '#/campaigns/library']) {
    assert.match(shell, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(router, /resolveCampaignDetailRoute/);
  assert.equal(
    routeContract.includes('pattern: /^\\/campaigns\\/([^/?#]+)'),
    true,
    'missing #/campaigns/:id route contract',
  );
  assert.match(campaignApiSource, /\/v1\/fundtogether/);
  assert.doesNotMatch(campaignApiSource, /\/v1\/campaigns(?!\/)/);
});
