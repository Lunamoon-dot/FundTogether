const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, sep } = require('node:path');
const { createHash } = require('node:crypto');
const { traceCampaign, buildFixtures } = require('./fixtures.cjs');

const donors = [{ wallet: 'donor-a', amount: '1980000000' }, { wallet: 'donor-b', amount: '1320000000' }];
const budgets = ['1100000000', '1100000000', '1100000000'];
const advance = (stage) => ({ kind: 'advance', stage });
const settle = (stage) => ({ kind: 'accept', stage });
const claim = (wallet) => ({ kind: 'refund', wallet });

test('G2 acceptance moves no money and three advances consume exactly the goal', () => {
  const result = traceCampaign({ budgets, donors, actions: [advance(0), settle(0), advance(1), settle(1), advance(2), settle(2), { kind: 'snapshot' }] });
  assert.ok(result, 'offline trace is implemented');
  assert.equal(result.rows[0].custody, '2200000000');
  assert.equal(result.rows[1].advanced, '1100000000');
  assert.equal(result.rows[1].custody, '2200000000');
  assert.equal(result.rows[3].custody, '1100000000');
  assert.equal(result.custody, '0');
  assert.equal(result.advanced, '3300000000');
  assert.equal(result.basePool, '0');
});

test('G2 STOP refunds only 1100 remaining, proportional to original contributions', () => {
  const result = traceCampaign({ budgets, donors, actions: [advance(0), settle(0), advance(1), { kind: 'snapshot' }, claim('donor-b'), claim('donor-a')] });
  assert.ok(result, 'offline trace is implemented');
  assert.equal(result.basePool, '1100000000');
  assert.equal(result.rows[4].amount, '440000000');
  assert.equal(result.rows[5].amount, '660000000');
  assert.equal(result.refunded, '1100000000');
  assert.equal(result.custody, '0');
});

test('G1 full advance leaves a zero pool unless an actual return is recorded', () => {
  const base = { budgets: ['2200000000'], donors: [{ wallet: 'donor-a', amount: '1320000000' }, { wallet: 'donor-b', amount: '880000000' }] };
  const failed = traceCampaign({ ...base, actions: [advance(0), { kind: 'snapshot' }] });
  assert.ok(failed, 'offline trace is implemented');
  assert.equal(failed.basePool, '0');
  const returned = traceCampaign({ ...base, actions: [advance(0), { kind: 'return', stage: 0, amount: '50000000' }, { kind: 'snapshot' }, claim('donor-a'), claim('donor-b')] });
  assert.equal(returned.basePool, '50000000');
  assert.equal(returned.refunded, '50000000');
  assert.equal(returned.custody, '0');
});

test('late returns preserve the base snapshot and credit wallets that already claimed', () => {
  const result = traceCampaign({ budgets, donors, actions: [advance(0), settle(0), advance(1), { kind: 'snapshot' }, claim('donor-a'),
    { kind: 'return', stage: 1, amount: '110000000' }, claim('donor-b'), claim('donor-a')] });
  assert.ok(result, 'offline trace is implemented');
  assert.equal(result.basePool, '1100000000');
  assert.equal(result.supplementPool, '110000000');
  assert.equal(result.rows[6].amount, '484000000');
  assert.equal(result.rows[7].amount, '66000000');
  assert.equal(result.refunded, '1210000000');
  assert.equal(result.custody, '0');
});

test('integer rounding keeps unclaimed obligations separate from dust as supplements accumulate', () => {
  const result = traceCampaign({ budgets: ['3', '7'], donors: [{ wallet: 'a', amount: '3' }, { wallet: 'b', amount: '7' }],
    actions: [advance(0), { kind: 'snapshot' }, claim('a'), { kind: 'return', stage: 0, amount: '1' }, claim('b'),
      { kind: 'return', stage: 0, amount: '2' }, claim('b')] });
  assert.ok(result, 'offline trace is implemented');
  assert.equal(result.basePool, '7');
  assert.equal(result.supplementPool, '3');
  assert.equal(result.refunded, '8');
  assert.equal(result.unclaimed, '0');
  assert.equal(result.dust, '2');
  assert.equal(result.custody, '2');
});

test('a supplemental entitlement remains owed to a donor who claimed before the later return', () => {
  const result = traceCampaign({ budgets: ['3', '7'], donors: [{ wallet: 'a', amount: '3' }, { wallet: 'b', amount: '7' }],
    actions: [advance(0), { kind: 'snapshot' }, claim('b'), { kind: 'return', stage: 0, amount: '3' }] });
  assert.ok(result, 'offline trace is implemented');
  assert.equal(result.unclaimed, '4');
  assert.equal(result.dust, '2');
  assert.equal(result.custody, '6');
});

test('tiny units, zero contribution and large uint256-scale values use exact integer arithmetic', () => {
  const empty = traceCampaign({ budgets: ['1'], donors: [], actions: [{ kind: 'snapshot' }] });
  assert.ok(empty, 'offline trace is implemented');
  assert.equal(empty.basePool, '0');
  const big = '900719925474099300000000';
  const result = traceCampaign({ budgets: [big], donors: [{ wallet: 'a', amount: big }], actions: [{ kind: 'snapshot' }, claim('a')] });
  assert.equal(result.refunded, big);
  assert.equal(result.custody, '0');
});

test('invalid traces cannot double advance, over-return, refund twice, or advance after snapshot', () => {
  for (const actions of [
    [advance(0), advance(0)],
    [advance(1)],
    [advance(0), advance(1)],
    [settle(0)],
    [advance(0), settle(0), settle(0)],
    [advance(0), { kind: 'return', stage: 0, amount: '1100000001' }],
    [{ kind: 'return', stage: 0, amount: '1' }],
    [{ kind: 'snapshot' }, { kind: 'snapshot' }],
    [claim('donor-a')],
    [{ kind: 'snapshot' }, claim('unknown')],
    [{ kind: 'snapshot' }, claim('donor-a'), claim('donor-a')],
    [{ kind: 'snapshot' }, advance(0)],
  ]) assert.throws(() => traceCampaign({ budgets, donors, actions }), /invalid trace/);
  for (const amount of ['1.5', '-1', '0', 1, '1e6']) {
    assert.throws(() => traceCampaign({ budgets: [amount], donors: [], actions: [] }), /base unit/);
  }
  assert.throws(() => traceCampaign({ budgets: ['1'], donors: [{ wallet: 'a', amount: '2' }], actions: [] }), /goal/);
});

function withOutput(t) {
  const folder = mkdtempSync(join(tmpdir(), 'fundtogether-b-fixtures-'));
  t.after(() => {
    const target = resolve(folder);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes('fundtogether-b-fixtures-'));
    rmSync(target, { recursive: true, force: true });
  });
  return folder;
}

test('fixture builder writes original/public artifacts with hashes of the exact persisted bytes', (t) => {
  const folder = withOutput(t);
  buildFixtures(folder);
  assert.ok(existsSync(join(folder, 'catalog.json')), 'catalog of real fixture files exists');
  const catalog = JSON.parse(readFileSync(join(folder, 'catalog.json'), 'utf8'));
  assert.equal(catalog.packages.length, 12);
  for (const entry of catalog.packages) {
    for (const visibility of ['original', 'public']) {
      const bytes = readFileSync(join(folder, entry[visibility].path));
      assert.equal('0x' + createHash('sha256').update(bytes).digest('hex'), entry[visibility].sha256);
      assert.notEqual(bytes.subarray(0, 3).toString('hex'), 'efbbbf');
      const manifest = JSON.parse(bytes);
      assert.equal(manifest.context.campaignKey, entry.campaignKey);
      assert.equal(manifest.context.stage, entry.stage);
      assert.equal(manifest.synthetic, true);
      for (const file of manifest.documents) {
        const document = readFileSync(join(folder, file.path));
        assert.equal(document.length, file.byteSize);
        assert.equal('0x' + createHash('sha256').update(document).digest('hex'), file.sha256);
      }
    }
    assert.notEqual(entry.original.sha256, entry.public.sha256);
    const publicBytes = readFileSync(join(folder, entry.public.path), 'utf8');
    assert.ok(!publicBytes.includes('recipientIds') && !publicBytes.includes('privateContact'));
    assert.ok(!publicBytes.includes('expectedLabel'), 'review labels are separate from participant manifests');
  }
  const labels = JSON.parse(readFileSync(join(folder, 'reference-labels.json'), 'utf8'));
  assert.equal(labels.entries.find((p) => p.key === 'G1-wrong-signer').label, 'NOT_MET');
  assert.equal(labels.entries.find((p) => p.key === 'G1-missing-invoice').label, 'NEEDS_INFORMATION');
  assert.equal(labels.entries.find((p) => p.key === 'G1-inconclusive').label, 'INCONCLUSIVE');
});

test('fixtures preserve prior packages, show missing invoices, and expose cross-stage photo reuse', (t) => {
  const folder = withOutput(t);
  const catalog = buildFixtures(folder);
  assert.ok(catalog?.packages, 'fixture catalog is returned');
  const load = (key) => {
    const entry = catalog.packages.find((p) => p.key === key);
    assert.ok(entry, `package ${key} exists`);
    return JSON.parse(readFileSync(join(folder, entry.original.path), 'utf8'));
  };
  const missing = load('G1-missing-invoice');
  assert.ok(!missing.documents.some((doc) => doc.kind === 'INVOICE'));
  const prior = load('G1-pass');
  const supplemental = load('G1-surplus');
  assert.equal(supplemental.parentPackageKey, 'G1-pass');
  assert.equal(supplemental.context.submissionVersion, '2');
  assert.equal(prior.report.unused, '0');
  assert.equal(supplemental.report.unused, '50000000');
  const photo = (manifest) => manifest.documents.find((d) => d.kind === 'PHOTO').sha256;
  assert.equal(photo(load('G2-stage-1-pass')), photo(load('G2-stage-2-reused-photo')));
  assert.notEqual(photo(load('G2-stage-1-pass')), photo(load('G2-stage-2-pass')));
  assert.equal(photo(load('G1-reused-photo')), photo(load('G2-stage-1-pass')));
});

test('evidence supplementation annotations cannot change custody or create another advance', () => {
  const result = traceCampaign({ budgets, donors, actions: [advance(0), settle(0), advance(1),
    { kind: 'note', description: 'Version 1 lacks evidence; request information' },
    { kind: 'note', description: 'Version 2 supplies missing evidence; review pending' }, settle(1)] });
  assert.equal(result.rows[3].advanced, '2200000000');
  assert.equal(result.rows[4].advanced, '2200000000');
  assert.equal(result.rows[4].custody, '1100000000');
  assert.equal(result.rows[5].amount, '0');
});

test('regenerating fixtures produces byte-identical artifacts and portable paths', (t) => {
  const first = withOutput(t);
  const second = withOutput(t);
  buildFixtures(first);
  buildFixtures(second);
  assert.ok(existsSync(join(first, 'catalog.json')), 'fixture generator exists');
  const files = readdirSync(first, { recursive: true }).filter((p) => !require('node:fs').statSync(join(first, p)).isDirectory());
  assert.ok(files.length > 50);
  for (const file of files) assert.deepEqual(readFileSync(join(first, file)), readFileSync(join(second, file)), file);
  assert.ok(!readFileSync(join(first, 'catalog.json'), 'utf8').includes('\\\\'));
});

test('package commitments bind the frozen plan, criteria and policy; payment totals use the same unit', (t) => {
  const folder = withOutput(t);
  const catalog = buildFixtures(folder);
  assert.ok(catalog.plans?.length === 2, 'two frozen sample plans exist');
  for (const entry of catalog.packages) {
    const manifest = JSON.parse(readFileSync(join(folder, entry.original.path), 'utf8'));
    const plan = catalog.plans.find((item) => item.campaignKey === entry.campaignKey);
    assert.equal(manifest.planHash, plan.plan.sha256);
    assert.equal(manifest.criteriaHash, plan.criteria.sha256);
    assert.equal(manifest.policyHash, catalog.policy.sha256);
    const proof = manifest.documents.find((doc) => doc.kind === 'PAYMENT_PROOF');
    assert.ok(proof, 'payment proof bytes are generated');
    const payment = JSON.parse(readFileSync(join(folder, proof.path), 'utf8'));
    assert.equal(payment.amount, manifest.report.campaignSpent);
    assert.equal(payment.minorUnit, 6);
  }
});

test('generator refuses to overwrite frozen bytes that have changed', (t) => {
  const folder = withOutput(t);
  buildFixtures(folder);
  assert.ok(existsSync(join(folder, 'catalog.json')), 'fixtures were generated');
  const path = join(folder, 'G1-pass/original/invoice.json');
  require('node:fs').writeFileSync(path, 'changed bytes');
  assert.throws(() => buildFixtures(folder), /Frozen fixture differs/);
  assert.equal(readFileSync(path, 'utf8'), 'changed bytes');
});
