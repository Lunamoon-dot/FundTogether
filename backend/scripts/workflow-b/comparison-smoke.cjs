// Controlled A/B contract comparison on an owned disposable fork, never RPC8545.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createPublicClient, createWalletClient, http, keccak256, toHex, encodeFunctionData, decodeEventLog } = require('viem');
const { startFork } = require('./journey-smoke.cjs');
const { guardEnvironment } = require('./guard-environment.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const root = path.resolve(__dirname, '../../..'), url = 'http://127.0.0.1:9548';
const baseline = 'b1881bd2cb3d6a4413605b06741624e86e2323da';
const commitment = text => keccak256(toHex(`Synthetic comparison: ${text}`));
const plan = commitment('plan'), reason = commitment('review'), verification = commitment('authority');
const json = value => JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v));

async function main() {
  guardEnvironment(process.env);
  execFileSync('git', ['diff', '--exit-code', baseline, '--', 'contracts/src/FundTogetherMvp.sol',
    'contracts/src/FundTogetherConfigured.sol', 'contracts/src/FundTogether.sol', 'contracts/src/modules'], { cwd: root, stdio: 'pipe' });
  const artifacts = {};
  for (const name of ['MockUSDC', 'FundTogetherMvp', 'FundTogetherAdvance']) {
    const artifact = JSON.parse(fs.readFileSync(path.join(root, `contracts/out/${name}.sol/${name}.json`), 'utf8'));
    for (const [file, source] of Object.entries(artifact.metadata.sources)) {
      const bytes = fs.readFileSync(path.join(root, 'contracts', file));
      // WSL's dependency checkout used LF; Windows Git materializes CRLF.
      const hash = file.startsWith('lib/') && keccak256(bytes) !== source.keccak256
        ? keccak256(toHex(bytes.toString('utf8').replace(/\r\n/g, '\n'))) : keccak256(bytes);
      assert.equal(hash, source.keccak256, `Stale artifact: ${file}`);
    }
    artifacts[name] = artifact;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/generated/deployment.local.json'), 'utf8'));
  const { AdvanceBlockchainService } = require(path.join(root, 'backend/dist/src/advance/advance-blockchain.service'));
  const source = new AdvanceBlockchainService(manifest); await source.verifyDeployment();
  const sourceHead = await source.client.getBlock(), sourceCount = await source.read('nextCampaignId', []);
  const fork = await startFork();
  const client = createPublicClient({ chain: source.client.chain, transport: http(url, { retryCount: 0 }), pollingInterval: 50 });
  const report = { testedAt: new Date().toISOString(), deploymentId: manifest.deploymentId, baseline,
    mode: 'CONTROLLED_CONTRACT_COMPARISON', humanExperiment: false, sourceBlock: sourceHead.number,
    assumptions: ['Same exact-transfer 6-decimal MockUSDC and equal contributions from two donors',
      'Same G1 budget2200 or G2 budgets1100/1100/1100; one activity at a time, full budget spent',
      'Vendor transfers model full payment before review; no credit, fiat conversion, borrowing or real delivery',
      'A locks max stage budget as bond and recycles reimbursements; B starts with zero organizer tokens',
      'Gas is receipt gasUsed on fresh contracts with optimizer200/solc0.8.24; excludes deployment/mint/vendor payment',
      'Source hashes match compiler metadata; dependency CRLF is normalized to the WSL build LF bytes',
      'A/B have different approved review/deadline rules; no human delay or false-accept rate measured'],
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([name, a]) => [name, {
      initCodeHash: keccak256(a.bytecode.object), compiler: a.metadata.compiler, optimizer: a.metadata.settings.optimizer }])),
    receipts: [], journeys: [], checks: [] };
  try {
    const accounts = await client.request({ method: 'eth_accounts' });
    const [resolver, organizer, donorA, donorB, vendor] = accounts;
    const wallets = new Map(accounts.slice(0, 5).map(account => [account, createWalletClient({ account, chain: client.chain, transport: http(url) })]));
    async function receipt(hash, label, category, functionName, data, actor, target, started) {
      const r = await client.waitForTransactionReceipt({ hash }); assert.equal(r.status, 'success', functionName);
      const tx = await client.getTransaction({ hash });
      assert.equal(tx.input, data); assert.equal(tx.from.toLowerCase(), actor.toLowerCase());
      if (target) assert.equal(tx.to.toLowerCase(), target.address.toLowerCase());
      assert.equal((await client.getBlock({ blockNumber: r.blockNumber })).hash, r.blockHash);
      const events = target ? r.logs.filter(l => l.address.toLowerCase() === target.address.toLowerCase()).map(l =>
        decodeEventLog({ abi: target.abi, data: l.data, topics: l.topics, strict: true })) : [];
      report.receipts.push(json({ label, category, functionName, hash, blockNumber: r.blockNumber, blockHash: r.blockHash,
        gasUsed: r.gasUsed, gasLimit: tx.gas, events, minedMs: Math.round(performance.now() - started) }));
      return r;
    }
    async function deploy(name, args, label) {
      const a = artifacts[name], started = performance.now();
      const hash = await wallets.get(resolver).deployContract({ abi: a.abi, bytecode: a.bytecode.object, args, gas: 8_000_000n });
      const tx = await client.getTransaction({ hash });
      const r = await receipt(hash, label, 'SETUP', `deploy:${name}`, tx.input, resolver, null, started);
      assert.ok(r.contractAddress); assert.notEqual(await client.getCode({ address: r.contractAddress }), '0x');
      return { address: r.contractAddress, abi: a.abi };
    }
    const read = (target, functionName, args = []) => client.readContract({ ...target, functionName, args });
    async function send(target, actor, functionName, args, label, category = 'PROTOCOL') {
      const data = encodeFunctionData({ abi: target.abi, functionName, args });
      await client.call({ account: actor, to: target.address, data });
      const estimate = await client.estimateGas({ account: actor, to: target.address, data }), started = performance.now();
      const hash = await wallets.get(actor).sendTransaction({ to: target.address, data, gas: estimate * 120n / 100n });
      return receipt(hash, label, category, functionName, data, actor, target, started);
    }
    async function warp(timestamp) {
      assert.equal(client.transport.url, url);
      await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] });
      await client.request({ method: 'evm_mine' });
    }
    for (const scenario of [{ name: 'G1-complete', count: 1 }, { name: 'G2-complete', count: 3 }, { name: 'G2-no-evidence-stage2', count: 3, stop: true }]) {
      for (const protocol of ['A', 'B']) {
        const label = `${scenario.name}-${protocol}`, budget = scenario.count === 1 ? 2200_000000n : 1100_000000n;
        const goal = budget * BigInt(scenario.count), bond = protocol === 'A' ? budget : 0n;
        const token = await deploy('MockUSDC', [], label);
        const contract = await deploy(protocol === 'A' ? 'FundTogetherMvp' : 'FundTogetherAdvance',
          protocol === 'A' ? [token.address, commitment(label)] : [token.address, resolver, commitment(label)], label);
        assert.equal(await read(contract, 'deploymentId'), commitment(label));
        const tx = (actor, name, args) => send(contract, actor, name, args, label);
        const tokens = (actor, name, args, category) => send(token, actor, name, args, label, category);
        const balance = actor => read(token, 'balanceOf', [actor]);
        if (bond) {
          await tokens(resolver, 'mint', [organizer, bond + budget], 'SETUP');
          await tokens(organizer, 'approve', [contract.address, bond], 'PROTOCOL');
        }
        const budgets = Array(scenario.count).fill(budget), criteria = budgets.map((_v, i) => commitment(`criterion${i}`));
        if (protocol === 'A') {
          await tx(organizer, 'submitCampaignForDraft', [commitment(label), label, (await client.getBlock()).timestamp + 86400n, budgets, criteria]);
          await tx(resolver, 'approveCampaign', [0n]); await tx(organizer, 'publishCampaign', [0n]);
        } else {
          await tx(organizer, 'submitCampaignForDraft', [commitment(label), plan, 86400n, budgets, criteria]);
          await tx(resolver, 'approveCampaign', [0n, plan, verification, reason]); await tx(organizer, 'publishCampaign', [0n, plan]);
        }
        for (const donor of [donorA, donorB]) {
          await tokens(resolver, 'mint', [donor, goal / 2n], 'SETUP');
          await tokens(donor, 'approve', [contract.address, goal / 2n], 'PROTOCOL');
          await tx(donor, 'donate', [0n, goal / 2n]);
        }
        if (protocol === 'B') await tx(resolver, 'confirmFirstAdvance', [0n, plan, verification, reason]);
        const rows = [];
        for (let i = 0; i < (scenario.stop ? 2 : scenario.count); i++) {
          const stage = BigInt(i), prior = budget * stage;
          await tx(organizer, protocol === 'A' ? 'activateMilestone' : 'claimAdvance', protocol === 'A' ? [0n, stage] : [0n, stage, plan]);
          const expectedCustody = goal - prior - (protocol === 'B' ? budget : 0n);
          assert.equal(await balance(contract.address), expectedCustody + bond);
          assert.equal(await balance(organizer), budget, 'Exactly one activity can be paid before review');
          await tokens(organizer, 'transfer', [vendor, budget], 'ACTIVITY_MODEL');
          assert.equal(await balance(organizer), 0n);
          rows.push({ stage: i, donorEscrowBeforeReview: expectedCustody, unacceptedDonorPayout: protocol === 'B' ? budget : 0n });
          if (scenario.stop && i === 1) {
            await warp(protocol === 'A' ? await read(contract, 'evidenceDeadlines', [0n, stage]) : (await read(contract, 'stage', [0n, stage])).submissionEnd);
            await tx(donorA, protocol === 'A' ? 'finalizeMilestoneTimeout' : 'finalizeTimeout', protocol === 'A' ? [0n, stage] : [0n]);
            break;
          }
          const hash = commitment(`${label}:stage${i}`), ref = { campaignId: 0n, stage, version: 1n, evidenceHash: hash };
          await tx(organizer, 'submitEvidence', protocol === 'A' ? [0n, stage, hash] : [0n, stage, 1n, hash]);
          await tx(resolver, protocol === 'A' ? 'admitEvidence' : 'approveEvidence',
            protocol === 'A' ? [0n, stage, 1n, hash, reason] : [ref, verification, reason, budget]);
          const end = protocol === 'A' ? (await read(contract, 'milestoneEvidence', [0n, stage]))[1] : (await read(contract, 'stage', [0n, stage])).challengeEnd;
          await warp(end);
          await tx(donorA, protocol === 'A' ? 'settleMilestoneForVersion' : 'finalizeStage', protocol === 'A' ? [0n, stage, 1n, hash] : [ref]);
          assert.equal(await balance(organizer), protocol === 'A' ? budget : 0n, 'Only A pays at acceptance');
        }
        const pool = scenario.stop ? (protocol === 'A' ? goal - budget : goal - 2n * budget) : 0n;
        if (protocol === 'A') {
          assert.equal(await read(contract, 'campaignState', [0n]), scenario.stop ? 12 : 10);
          assert.equal(await read(contract, 'claimableBond', [0n]), bond);
          await tx(organizer, 'claimBond', [0n]);
          assert.equal(await read(contract, 'refundPool', [0n]), pool);
        } else {
          const c = await read(contract, 'campaign', [0n]);
          assert.equal(c.state, scenario.stop ? 11 : 10); assert.equal(c.basePool, pool);
        }
        if (scenario.stop) for (const donor of [donorA, donorB]) {
          await tx(donor, 'claimRefund', [0n]); assert.equal(await balance(donor), pool / 2n);
        }
        assert.equal(await balance(contract.address), 0n);
        const measured = report.receipts.filter(r => r.label === label && r.category === 'PROTOCOL');
        report.journeys.push(json({ label, protocol, budgets, goal, bond, organizerStartingCapital: protocol === 'A' ? bond + budget : 0n,
          peakUnacceptedDonorPayout: protocol === 'B' ? budget : 0n, finalRefundPool: pool, protocolTransactions: measured.length,
          protocolGasUsed: measured.reduce((sum, r) => sum + BigInt(r.gasUsed), 0n), rows }));
        console.log(`${label}: ${measured.length} protocol receipts; capital${protocol === 'A' ? bond + budget : 0n}; refund${pool}`);
      }
    }
    assert.equal(await source.read('nextCampaignId', []), sourceCount);
    assert.equal((await source.client.getBlock({ blockNumber: sourceHead.number })).hash, sourceHead.hash);
    report.checks.push('A baseline source and all compiled source hashes verified', 'Six comparable paths conserve custody and refund actual pools', 'Source B preserved; no access to A RPC/DB/storage');
    report.result = 'PASS';
  } finally { await fork.stop(); }
  atomicWrite(path.join(root, '.local/workflow-b/comparison-report.json'), json(report));
  console.log('Workflow B controlled A/B comparison PASS; owned fork stopped');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
