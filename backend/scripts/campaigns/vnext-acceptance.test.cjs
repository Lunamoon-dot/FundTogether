const test = require('node:test');
const assert = require('node:assert/strict');
const { findCampaignProjection } = require('./vnext-acceptance.cjs');

test('VNext acceptance selects a projection from the current deployment stream', () => {
  const oldDeployment = { streamId: 'vnext:old', onchainCampaignId: '0', state: 0 };
  const currentDeployment = { streamId: 'vnext:current', onchainCampaignId: '0', state: 4 };

  assert.equal(
    findCampaignProjection([oldDeployment, currentDeployment], 'vnext:current', '0'),
    currentDeployment,
  );
});
