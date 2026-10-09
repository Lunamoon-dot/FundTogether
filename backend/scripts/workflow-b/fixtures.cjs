// Offline research fixtures only; no chain, database or storage connection.
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { createHash } = require('node:crypto');
const { traceCampaign } = require('./accounting.cjs');

const variants = [
  ['G1-pass', 'G1', 0, 'MET', 'Full institution handover with authorized signer.'],
  ['G1-missing-invoice', 'G1', 0, 'NEEDS_INFORMATION', 'Purchase invoice is absent; quantities alone do not establish cost.'],
  ['G1-wrong-signer', 'G1', 0, 'NOT_MET', 'Signer is explicitly absent from the synthetic authority registry.'],
  ['G1-shortage', 'G1', 0, 'NOT_MET', 'Only 90 of 100 required packages were delivered.'],
  ['G1-overspend', 'G1', 0, 'NEEDS_INFORMATION', 'Report charges 2250 to a 2200 campaign advance; separate organizer funding must be evidenced.'],
  ['G1-surplus', 'G1', 0, 'MET_CONDITIONAL_RETURN', 'Results met; 50 must actually return before final acceptance can close.'],
  ['G1-inconclusive', 'G1', 0, 'INCONCLUSIVE', 'Authority/contact could not be independently checked.'],
  ['G1-reused-photo', 'G1', 0, 'INCONCLUSIVE', 'An image from a different campaign is offered as institution handover evidence; check provenance.'],
  ['G2-stage-1-pass', 'G2', 0, 'MET', 'Stage 1 result and sample checks are consistent with the synthetic source.'],
  ['G2-stage-2-pass', 'G2', 1, 'MET', 'Stage 2 has its own delivery records and image.'],
  ['G2-stage-3-pass', 'G2', 2, 'MET', 'Final stage still requires a substantive acceptance decision.'],
  ['G2-stage-2-reused-photo', 'G2', 1, 'INCONCLUSIVE', 'Stage 1 image reused for stage 2; investigate provenance, do not infer fraud from hash alone.'],
];

function buildFixtures(outputDir) {
  const root = resolve(outputDir);
  const digest = (bytes) => '0x' + createHash('sha256').update(bytes).digest('hex');
  const save = (path, value, mediaType = 'application/json') => {
    const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', 'utf8');
    const target = resolve(root, path);
    if (existsSync(target) && !readFileSync(target).equals(bytes)) throw new Error(`Frozen fixture differs: ${path}; choose a new output directory`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return { path, mediaType, byteSize: bytes.length, sha256: digest(bytes) };
  };
  const photo = (campaign, stage) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180"><rect width="640" height="180" fill="#eaf3f0"/><text x="20" y="40" font-family="sans-serif" font-size="22">SYNTHETIC IMAGE - ${campaign} stage ${stage + 1}</text><text x="20" y="75" font-family="sans-serif" font-size="16">Fixture illustration only. No real delivery is depicted.</text><rect x="20" y="100" width="80" height="55" fill="#c59155"/><rect x="120" y="100" width="80" height="55" fill="#c59155"/><rect x="220" y="100" width="80" height="55" fill="#c59155"/></svg>\n`;
  const policy = save('policy-proposal.json', { synthetic: true, status: 'DRAFT', bond: '0',
    firstReviewSeconds: 259200, claimSeconds: 604800, executionSeconds: 2592000, reviewSeconds: 259200,
    supplementSeconds: 604800, challengeSeconds: 259200, responseSeconds: 259200, resolutionSeconds: 259200,
    finalizationSeconds: 604800, hardStopSeconds: 5184000, maxVersions: 3, casesPerVersion: 1,
    returnPolicy: 'immutable-base-plus-cumulative-supplement', refundRounding: 'floor-base-unit', sweep: false });
  const plans = ['G1', 'G2'].map((campaignKey) => {
    const institution = campaignKey === 'G1';
    const criteria = save(`${campaignKey}/criteria.json`, { synthetic: true, checklistVersion: 'gift-review-draft-v1',
      criteria: [
        { criterionId: `${campaignKey}-C1`, requiredPackages: institution ? 100 : 50,
          contents: ['rice-2kg', 'oil-1l', 'noodles-5packs'], sources: ['inventory', 'delivery', 'photo'], checker: 'resolver' },
        { criterionId: `${campaignKey}-C2`, scope: 'purchase-and-campaign-cost', sources: ['invoice', 'payment-proof', 'budget'], checker: 'resolver' },
        { criterionId: `${campaignKey}-C3`, scope: institution ? 'authorized-institution-handover' : 'eligible-individual-handover',
          sources: ['delivery', 'contact-check'], sampleSize: institution ? 1 : 10, checker: 'resolver' },
        { criterionId: `${campaignKey}-C4`, scope: 'unused-reconciliation-and-actual-return', sources: ['budget', 'chain-return-event-after-implementation'], checker: 'resolver-and-contract' },
      ] });
    const plan = save(`${campaignKey}/plan.json`, { synthetic: true, campaignKey, activityType: 'GIFT_DISTRIBUTION',
      channel: institution ? 'INSTITUTION' : 'DIRECT', organizer: 'Synthetic Organizer A',
      recipientScope: institution ? 'Synthetic School A; handover to school only' : 'Three separate synthetic beneficiary groups; individual handover',
      eligibility: institution ? 'Institution authority checked against controlled registry' : 'Synthetic households marked eligible before funding; no wallet required',
      fundingDurationSeconds: 604800, policyHash: policy.sha256, criteriaHash: criteria.sha256,
      goal: institution ? '2200000000' : '3300000000', stages: Array.from({ length: institution ? 1 : 3 }, (_, stage) => ({ stage,
        budget: institution ? '2200000000' : '1100000000', packages: institution ? 100 : 50,
        goods: institution ? '2000000000' : '1000000000', transportation: institution ? '200000000' : '100000000',
        executionSlot: `Separate stage ${stage + 1}, within 30 days of its advance`, tasks: ['purchase', 'inventory', 'transport', 'handover'] })) });
    return { campaignKey, plan, criteria };
  });
  const packages = [], labels = [];
  for (const [key, campaignKey, stage, label, reason] of variants) {
    const institution = campaignKey === 'G1';
    const budget = institution ? '2200000000' : '1100000000';
    const count = key === 'G1-shortage' ? 90 : institution ? 100 : 50;
    const criteria = institution ? ['G1-C1', 'G1-C2', 'G1-C3', 'G1-C4'] : ['G2-C1', 'G2-C2', 'G2-C3', 'G2-C4'];
    const spent = key === 'G1-overspend' ? '2250000000' : key === 'G1-surplus' ? '2150000000' : budget;
    const goods = String(BigInt(count) * 20000000n);
    const context = { environment: 'offline', policyStatus: 'DRAFT', fixtureDeploymentId: 'workflow-b-review-v1',
      campaignKey, activityType: 'GIFT_DISTRIBUTION', channel: institution ? 'INSTITUTION' : 'DIRECT',
      stage, submissionVersion: key === 'G1-surplus' ? '2' : '1', checklistVersion: 'gift-review-draft-v1' };
    const documents = [
      { name: 'invoice.json', kind: 'INVOICE', criteria: [criteria[1]], value: { synthetic: true, vendor: 'Synthetic Vendor A',
        packages: count, contents: ['rice-2kg', 'oil-1l', 'noodles-5packs'], unitPrice: '20000000', goods, currency: 'MockUSDC', minorUnit: 6 } },
      { name: 'payment-proof.json', kind: 'PAYMENT_PROOF', criteria: [criteria[1]], value: { synthetic: true,
        paymentReference: `SYNTHETIC-PAYMENT-${key}`, amount: spent, goods, transportation: String(BigInt(spent) - BigInt(goods)),
        currency: 'MockUSDC', minorUnit: 6, limitation: 'Fictional receipt, not a real bank or token transaction.' } },
      { name: 'inventory.json', kind: 'REPORT', criteria: [criteria[0]], value: { synthetic: true, checkedPackages: count,
        checkedContents: ['rice-2kg', 'oil-1l', 'noodles-5packs'], checker: 'Synthetic Organizer A' } },
      { name: 'delivery.json', kind: 'DELIVERY_RECORD', criteria: [criteria[0], criteria[2]], value: { synthetic: true, campaignKey, stage,
        deliveredPackages: count, scope: institution ? 'handover-to-institution' : 'handover-to-individuals',
        signer: key === 'G1-wrong-signer' ? 'Synthetic Unauthorized Visitor' : 'Synthetic Authorized Contact A',
        recipientIds: Array.from({ length: count }, (_, i) => `SYNTHETIC-${campaignKey}-${stage}-${i + 1}`), privateContact: 'fake-contact.invalid' } },
      { name: 'contact-check.json', kind: 'REPORT', criteria: [criteria[2]], value: { synthetic: true,
        authorityRegistry: ['Synthetic Authorized Contact A'], authorityConfirmed: key === 'G1-wrong-signer' ? false : key === 'G1-inconclusive' ? null : true,
        method: institution ? 'controlled-contact-check' : 'controlled-10-of-50-sample', checkedCount: institution ? 1 : 10,
        sampleIds: institution ? [] : Array.from({ length: 10 }, (_, i) => `SYNTHETIC-${campaignKey}-${stage}-${i * 5 + 1}`),
        limitation: 'Controlled fixture, not independent field research; a sample does not prove every delivery.' } },
      { name: 'budget.json', kind: 'REPORT', criteria: [criteria[1], criteria[3]], value: { synthetic: true, budget,
        campaignSpent: spent, unused: key === 'G1-surplus' ? '50000000' : '0', currency: 'MockUSDC', minorUnit: 6,
        returnsActuallyReceived: '0', fundingSource: 'CAMPAIGN' } },
      { name: 'photo.svg', kind: 'PHOTO', criteria: [criteria[0], criteria[2]], value: photo(key === 'G1-reused-photo' ? 'G2' : campaignKey, key.includes('reused-photo') ? 0 : stage), mediaType: 'image/svg+xml' },
    ].filter((doc) => !(key === 'G1-missing-invoice' && doc.kind === 'INVOICE'));
    const refs = { original: [], public: [] };
    for (const doc of documents) {
      for (const visibility of ['original', 'public']) {
        const content = structuredClone(doc.value);
        if (visibility === 'public' && typeof content === 'object') {
          delete content.recipientIds;
          delete content.privateContact;
          delete content.sampleIds;
        }
        refs[visibility].push({ documentId: doc.name, kind: doc.kind, criterionIds: doc.criteria,
          ...save(`${key}/${visibility}/${doc.name}`, content, doc.mediaType) });
      }
    }
    const plan = plans.find((item) => item.campaignKey === campaignKey);
    const shared = { schemaVersion: 'workflow-b-offline-fixture/1', synthetic: true, context,
      planHash: plan.plan.sha256, criteriaHash: plan.criteria.sha256, policyHash: policy.sha256,
      parentPackageKey: key === 'G1-surplus' ? 'G1-pass' : null,
      report: { budget, campaignSpent: spent, unused: key === 'G1-surplus' ? '50000000' : '0',
        outcomes: criteria.map((criterionId) => ({ criterionId, documentIds: documents.filter((doc) => doc.criteria.includes(criterionId)).map((doc) => doc.name) })) } };
    const original = save(`${key}/original/manifest.json`, { ...shared, visibility: 'RESTRICTED_ORIGINAL', documents: refs.original });
    const publicManifest = save(`${key}/public/manifest.json`, { ...shared, visibility: 'PUBLIC_REDACTED', originalManifestHash: original.sha256, documents: refs.public });
    packages.push({ key, campaignKey, stage, original, public: publicManifest });
    labels.push({ key, label, reason, source: 'Predetermined synthetic rubric, not output of a reviewer or blockchain.' });
  }
  const donor = (a, b) => [{ wallet: 'donor-a', amount: a }, { wallet: 'donor-b', amount: b }];
  const g1 = { budgets: ['2200000000'], donors: donor('1320000000', '880000000') };
  const g2 = { budgets: ['1100000000', '1100000000', '1100000000'], donors: donor('1980000000', '1320000000') };
  const advance = (stage) => ({ kind: 'advance', stage });
  const accept = (stage) => ({ kind: 'accept', stage });
  const snapshot = { kind: 'snapshot' };
  const refunds = [{ kind: 'refund', wallet: 'donor-a' }, { kind: 'refund', wallet: 'donor-b' }];
  const scenarios = [
    ['G1-success', g1, [advance(0), accept(0), snapshot]],
    ['G1-stop-zero-pool', g1, [advance(0), snapshot]],
    ['G1-stop-return-50', g1, [advance(0), { kind: 'return', stage: 0, amount: '50000000' }, snapshot, ...refunds]],
    ['G1-success-surplus', g1, [advance(0), { kind: 'return', stage: 0, amount: '50000000' }, accept(0), snapshot, ...refunds]],
    ['G2-success', g2, [advance(0), accept(0), advance(1), accept(1), advance(2), accept(2), snapshot]],
    ['G2-stop-after-stage-2', g2, [advance(0), accept(0), advance(1), snapshot, ...refunds]],
    ['G2-late-return', g2, [advance(0), accept(0), advance(1), snapshot, ...refunds,
      { kind: 'return', stage: 1, amount: '110000000' }, ...refunds]],
    ['G2-supplement-no-second-advance', g2, [advance(0), accept(0), advance(1),
      { kind: 'note', description: 'Version 1 lacks evidence; supplement requested' },
      { kind: 'note', description: 'Version 2 supplies missing evidence; no second payment' }, accept(1)]],
  ];
  const traces = scenarios.map(([key, campaign, actions]) => ({ key, assumptions: 'DRAFT proposal; accept means finalized review; no deadlines, authority, transfers or chain simulated.',
    inputs: { ...campaign, actions }, ...traceCampaign({ ...campaign, actions }) }));
  save('accounting-traces.json', { synthetic: true, unit: 'MockUSDC base unit (6 decimals)', traces });
  save('reference-labels.json', { synthetic: true, evaluatorOnly: true, entries: labels });
  const catalog = { synthetic: true, policyStatus: 'DRAFT', schemaVersion: 'workflow-b-offline-fixture/1',
    warning: 'Local JSON/SVG lab fixtures. Not production upload DTOs, real photos, field evidence or access-controlled storage.', policy, plans, packages };
  save('catalog.json', catalog);
  return catalog;
}

if (require.main === module) {
  try {
    const output = resolve(__dirname, '../../../docs/examples/fixtures/workflow-b');
    const catalog = buildFixtures(output);
    console.log(`Generated ${catalog.packages.length} synthetic packages and 8 accounting traces in ${output}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { traceCampaign, buildFixtures };
