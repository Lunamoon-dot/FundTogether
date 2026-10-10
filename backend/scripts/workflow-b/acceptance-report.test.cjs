const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'acceptance-report.cjs'), 'utf8');
const local = path.resolve(__dirname, '../../../.local/workflow-b');
const deploymentId = '0x' + '1'.repeat(64);
function inventory(reports) {
  const files = { 'generated/deployment.local.json': { deploymentId }, ...reports };
  const key = name => path.relative(local, name).replaceAll('\\', '/');
  let result;
  vm.runInNewContext(source, { __dirname, console: { log() {} }, require(name) {
    if (name === 'node:fs') return {
      existsSync: name => Object.hasOwn(files, key(name)),
      readFileSync: name => { assert.ok(Object.hasOwn(files, key(name)), `Missing fixture ${key(name)}`); return JSON.stringify(files[key(name)]); },
    };
    if (name === './generate-artifacts.cjs') return { atomicWrite: (_path, value) => { result = JSON.parse(JSON.stringify(value)); } };
    return require(name);
  } });
  return result;
}
const completed = { label: 'G1-complete', snapshot: { campaign: { state: 'COMPLETED', advanced: '2200000000', custody: '0' } } };
const journey = patch => ({ context: { deploymentId }, result: 'PASS', testedAt: '2026-10-10T00:00:00Z', journeys: [completed], ...patch });

test('normal G1/G2 evidence comes from the current journey report, not a duplicate path in the failure suite', () => {
  const result = inventory({ 'journey-report.json': journey({}),
    'failure-journey-report.json': journey({ journeys: [{ ...completed, snapshot: { campaign: { state: 'STOPPED' } } }] }) });
  assert.equal(result.automatedCases.T01.status, 'AUTOMATED_PASS_FOR_RECORDED_PATH');
  assert.equal(result.automatedCases.T01.sourceReport, 'journey-report.json');
  assert.equal(result.automatedCases.T01.testedAt, '2026-10-10T00:00:00Z');
  assert.equal(result.automatedCases.T02.status, 'TODO');
});
test('missing, failed or contradictory normal journey cannot be masked by old passing failure-suite outcomes', () => {
  for (const current of [undefined, journey({ result: 'FAIL' }), journey({ checks: { assertion: 'FAIL' } })]) {
    const result = inventory({ 'failure-journey-report.json': journey({}), ...(current ? { 'journey-report.json': current } : {}) });
    assert.equal(result.automatedCases.T01.status, 'TODO');
  }
});
test('empty or contradictory PASS fields never fabricate passing evidence', () => {
  for (const report of [{ checks: {} }, { status: 'FAIL', contractSchemas: 'PASS' }, { result: 'PASS', checks: { privateFile: 'FAIL' } }]) {
    const result = inventory({ 'http-report.json': { deploymentId, ...report } });
    assert.equal(result.evidence['http-report.json'].status, 'UNVERIFIED');
  }
  assert.equal(inventory({}).evidence['organization-onboarding-report.json'].status, 'MISSING');
});
test('new onboarding and UI reports must match the configured deployment', () => {
  for (const file of ['organization-onboarding-report.json', 'ui-owner-browser-report.json', 'ui-review-browser-report.json']) {
    for (const report of [{ status: 'PASS' }, { status: 'PASS', deploymentId: 'another-deployment' }]) {
      assert.throws(() => inventory({ [file]: report }), /belongs to another deployment/);
    }
    assert.throws(() => inventory({ [file]: { context: { deploymentId }, deploymentId: 'another-deployment', status: 'PASS' } }), /conflicting deployment identity/);
  }
});
test('automated UI/onboarding records retain their scope and date without granting human acceptance', () => {
  const checkedAt = '2026-10-10T00:00:00Z';
  const result = inventory({ 'organization-onboarding-report.json': { deploymentId, status: 'PASS', kind: 'HTTP-PostgreSQL-private-storage-onboarding', checkedAt,
    checks: ['ACL checked'], limitations: ['Synthetic actors only'] },
  'ui-review-browser-report.json': { deploymentId, status: 'PASS', kind: 'mocked-API-browser-F4-F6', checkedAt, checks: ['Read-only UI'] } });
  assert.equal(result.evidence['organization-onboarding-report.json'].status, 'AUTOMATED_PASS');
  assert.equal(result.evidence['organization-onboarding-report.json'].testedAt, checkedAt);
  assert.deepEqual(result.evidence['organization-onboarding-report.json'].limitations, ['Synthetic actors only']);
  assert.equal(result.evidence['ui-review-browser-report.json'].kind, 'mocked-API-browser-F4-F6');
  assert.match(result.evidence['ui-review-browser-report.json'].sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.overall, 'IN_PROGRESS'); assert.equal(result.humanAcceptance, 'TODO'); assert.equal(result.independentReviewerExperiment, 'TODO');
});
