// Aggregate observed outputs without promoting automated checks to human acceptance.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { atomicWrite } = require('./generate-artifacts.cjs');
const root = path.resolve(__dirname, '../../..'), local = path.join(root, '.local/workflow-b');
const read = file => JSON.parse(fs.readFileSync(path.join(local, file), 'utf8'));
const manifest = read('generated/deployment.local.json');
const result = { generatedAt: new Date().toISOString(), deploymentId: manifest.deploymentId,
  overall: 'IN_PROGRESS', evidence: {}, automatedCases: {}, humanAcceptance: 'TODO', independentReviewerExperiment: 'TODO', baselineComparison: 'TODO' };
for (const file of ['journey-report.json', 'failure-journey-report.json', 'waiting-journey-report.json', 'comparison-report.json', 'recovery-report.json', 'indexer-report.json', 'http-report.json', 'frontend-wallet-report.json']) {
  if (!fs.existsSync(path.join(local, file))) { result.evidence[file] = { status: 'MISSING' }; continue; }
  const r = read(file);
  assert.equal(r.context?.deploymentId ?? r.deploymentId, manifest.deploymentId, `${file} belongs to another deployment`);
  const passed = r.result === 'PASS' || r.status === 'PASS' || r.contractSchemas === 'PASS'
    || (r.checks && !Array.isArray(r.checks) && Object.values(r.checks).every(v => v === 'PASS'));
  result.evidence[file] = { status: passed ? 'AUTOMATED_PASS' : 'UNVERIFIED', testedAt: r.testedAt ?? null,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(local, file))).digest('hex'), checks: r.assertions ?? r.checks ?? null };
  if (r.receipts) {
    const gas = {};
    for (const tx of r.receipts) {
      assert.match(tx.hash, /^0x[0-9a-f]{64}$/); assert.match(tx.blockHash, /^0x[0-9a-f]{64}$/);
      const group = gas[tx.category ? `${tx.category}/${tx.functionName}` : tx.functionName] ??= { count: 0, totalGas: '0', minGas: tx.gasUsed, maxGas: tx.gasUsed };
      group.count++; group.totalGas = (BigInt(group.totalGas) + BigInt(tx.gasUsed)).toString();
      if (BigInt(tx.gasUsed) < BigInt(group.minGas)) group.minGas = tx.gasUsed;
      if (BigInt(tx.gasUsed) > BigInt(group.maxGas)) group.maxGas = tx.gasUsed;
    }
    result.evidence[file].transactions = r.receipts.length;
    result.evidence[file].gasByFunction = gas;
    result.evidence[file].timingScope = 'Automated RPC send-to-receipt/indexer only; excludes human/extension delay';
  }
}
const failure = fs.existsSync(path.join(local, 'failure-journey-report.json')) ? read('failure-journey-report.json') : null;
const waiting = fs.existsSync(path.join(local, 'waiting-journey-report.json')) ? read('waiting-journey-report.json') : null;
const outcomes = new Map([failure, waiting].filter(r => r?.result === 'PASS').flatMap(r => r.journeys.map(j => [j.label, j])));
function outcome(id, label, expected, gaps = 'Manual extension/user acceptance TODO') {
  const found = outcomes.get(label), campaign = found?.snapshot.campaign;
  const valid = campaign && Object.entries(expected).every(([k, v]) => campaign[k] === v);
  result.automatedCases[id] = { status: valid ? 'AUTOMATED_PASS_FOR_RECORDED_PATH' : 'TODO', label, expected, remaining: gaps };
}
outcome('T01', 'G1-complete', { state: 'COMPLETED', advanced: '2200000000', custody: '0' });
outcome('T02', 'G2-complete', { state: 'COMPLETED', advanced: '3300000000', custody: '0' });
outcome('T03', 'G1-partial-funding-timeout', { state: 'STOPPED', refunded: '1100000000', custody: '0' });
outcome('T11', 'G2-case-stop', { state: 'STOPPED', basePool: '1100000000', supplementPool: '160000000', custody: '0' });
outcome('T12', 'G1-zero-base-stop', { state: 'STOPPED', basePool: '0', supplementPool: '50000000', custody: '0' });
outcome('T13', 'G1-return-before-stop', { state: 'STOPPED', basePool: '50000000', refunded: '50000000' });
outcome('T14', 'Tiny-units-donorB-first', { basePool: '5', supplementPool: '2', refunded: '5', custody: '2' });
outcome('T09', 'No-execution-evidence', { state: 'STOPPED', basePool: '0', custody: '0' });
outcome('T10', 'Evidence-version-limit', { state: 'STOPPED', basePool: '0', advanced: '2200000000' });
for (const [id, remaining] of Object.entries({
  T04: 'Unit/HTTP/FE gates pass; manual wallet state switches remain',
  T05: 'Neutral bundles prepared; actual human criterion decisions missing',
  T06: 'Version/hash/parent binding automated; human provenance review missing',
  T07: 'No human observations or independently validated reference labels',
  T08: 'CONTINUE/RESUBMIT/STOP, response boundary, case mined just before challengeEnd and resolution timeout automated; manual UX remains',
  T15: 'Contract false/revert/callback tests; injected custody-loss refund/retry integration when present; extension retry remains',
  T16: 'No MetaMask popup/decline/reload/replacement/manual observations',
  T17: 'Duplicate/reorg/crash and fresh reset/cold restore automated; operational manual walkthrough remains',
  T18: 'Storage policy/hash/ACL/missing-file and RPC/indexer recovery automated; full outage UI/manual remains',
})) result.automatedCases[id] = { status: 'PARTIAL_OR_HUMAN_TODO', remaining };
if (failure?.injectedTransferFailure) result.evidence['failure-journey-report.json'].injectedTransferFailure = failure.injectedTransferFailure;
if (failure?.result === 'PASS' && failure.injectedTransferFailure?.status === 'reverted' && failure.injectedTransferFailure.retainedRights)
  result.automatedCases.T15 = { status: 'AUTOMATED_PASS_FOR_RECORDED_PATH', remaining: 'Forced token-transfer failure reverts and preserves refund rights; retry succeeds. Contract covers false/reentrant token. Manual extension retry remains.' };
const comparison = fs.existsSync(path.join(local, 'comparison-report.json')) ? read('comparison-report.json') : null;
if (comparison?.result === 'PASS') result.baselineComparison = { status: 'CONTROLLED_CONTRACT_COMPARISON_PASS', journeys: comparison.journeys,
  remaining: 'No full A/B browser comparison, human timing or independently validated reviewer experiment' };
const reviewer = fs.existsSync(path.join(local, 'reviewer-results.json')) ? read('reviewer-results.json') : null;
result.reviewer = { corpus: 'reviewer-corpus-v3/reviewer/catalog.json', samples: 12, authoredReferencesIndependent: false,
  completedHumanObservations: reviewer?.completedObservations ?? null, inputStatus: reviewer?.status ?? 'NOT_READ',
  independentFalseAcceptanceRate: null, instruction: 'Read reviewer-results.json for supplied observations against authored references; these are not independent truth labels.' };
atomicWrite(path.join(local, 'acceptance-summary.json'), result);
console.log(`Workflow B acceptance inventory written: ${Object.values(result.evidence).filter(e => e.status === 'AUTOMATED_PASS').length} automated reports; overall IN_PROGRESS, manual/research TODO`);
