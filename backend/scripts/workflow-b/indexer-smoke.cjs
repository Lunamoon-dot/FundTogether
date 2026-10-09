const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createPublicClient, createWalletClient, http } = require('viem');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { sql, eq } = require('drizzle-orm');
const { guardEnvironment } = require('./guard-environment.cjs');
const { chain: network } = require('./deploy-isolated.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });

async function main() {
  guardEnvironment(process.env);
  const from = file => require(path.join(root, 'backend/dist/src', file));
  const schema = from('database/schema');
  const { AdvanceBlockchainService } = from('advance/advance-blockchain.service');
  const { AdvanceIndexerService } = from('advance/advance-indexer.service');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/generated/deployment.local.json'), 'utf8'));
  const source = new AdvanceBlockchainService(manifest);
  await source.verifyDeployment();
  const originalHead = await source.client.getBlock();
  const originalCount = await source.read('nextCampaignId', []);
  // Test transport injection only: production manifest/bootstrap remain fixed on9547.
  // All mutating JSON-RPC below targets this disposable localhost fork, never source.client.
  const fork = createPublicClient({ chain: network, transport: http('http://127.0.0.1:9548', { retryCount: 0 }), pollingInterval: 100 });
  const chain = new AdvanceBlockchainService(manifest);
  Object.defineProperty(chain, 'client', { value: fork, configurable: true });
  await chain.verifyDeployment();
  const accounts = await fork.request({ method: 'eth_accounts' });
  const wallet = createWalletClient({ account: accounts[1], chain: network, transport: http('http://127.0.0.1:9548') });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  const db = drizzle(pool, { schema });
  const rollback = new Error('ROLLBACK_ISOLATED_INDEXER_LAB');
  const checkpoints = [];
  let result;
  const hash = () => `0x${randomBytes(32).toString('hex')}`;
  async function send(functionName, args) {
    const txHash = await wallet.writeContract({ address: manifest.contractAddress, abi: chain.abi, functionName, args });
    const receipt = await fork.waitForTransactionReceipt({ hash: txHash });
    assert.equal(receipt.status, 'success');
    return receipt;
  }
  try {
    await db.transaction(async lab => {
      // Entire lab is rolled back; committed B projections/history are preserved.
      const indexer = new AdvanceIndexerService(lab, chain), stream = indexer.streamKey;
      await lab.delete(schema.advanceCampaignProjection).where(eq(schema.advanceCampaignProjection.streamId, stream));
      await lab.delete(schema.chainEvents).where(eq(schema.chainEvents.streamId, stream));
      await lab.delete(schema.indexerStreams).where(eq(schema.indexerStreams.streamId, stream));
      const catchUp = async instance => {
        for (let i = 0; i < 50; i++) { await instance.runOnce(); if ((await instance.status()).status === 'ready') return; }
        throw new Error('Indexer did not catch up within50 batches');
      };
      const state = async () => ({
        events: await lab.select().from(schema.chainEvents).where(eq(schema.chainEvents.streamId, stream)),
        projections: await lab.select().from(schema.advanceCampaignProjection).where(eq(schema.advanceCampaignProjection.streamId, stream)),
        stream: (await lab.select().from(schema.indexerStreams).where(eq(schema.indexerStreams.streamId, stream)))[0],
      });
      await catchUp(indexer);
      const baseline = await state();
      assert.ok(baseline.events.length > 0 && baseline.projections.length > 0, 'Run review-evidence smoke first');
      for (const row of baseline.projections) {
        const direct = await chain.snapshot(BigInt(row.onchainCampaignId), BigInt(row.snapshot.checkpoint.blockNumber));
        assert.deepEqual(row.snapshot.campaign, direct.campaign);
        assert.deepEqual(row.snapshot.stages, direct.stages);
        assert.ok(row.metadataId, 'Frozen B plan association required for seeded smoke campaigns');
      }
      const digest = value => require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
      const baselineEvents = digest([...baseline.events].sort((a, b) => a.transactionHash.localeCompare(b.transactionHash) || a.logIndex - b.logIndex));
      await catchUp(new AdvanceIndexerService(lab, chain));
      assert.equal((await state()).events.length, baseline.events.length);
      // Replay identical logs twice; event identity must not duplicate financial history.
      await lab.update(schema.indexerStreams).set({ lastBlock: null, lastBlockHash: null }).where(eq(schema.indexerStreams.streamId, stream));
      Object.defineProperty(chain, 'client', { value: { ...fork, getLogs: async args => { const logs = await fork.getLogs(args); return logs.flatMap(log => [log, log]); } }, configurable: true });
      await catchUp(indexer);
      const duplicate = await state();
      assert.equal(duplicate.events.length, baseline.events.length);
      assert.equal(digest([...duplicate.events].sort((a, b) => a.transactionHash.localeCompare(b.transactionHash) || a.logIndex - b.logIndex)), baselineEvents);
      Object.defineProperty(chain, 'client', { value: fork, configurable: true });
      const snap = await fork.request({ method: 'evm_snapshot' });
      const firstKey = hash(), planHash = hash(), criteriaHash = hash();
      const first = await send('submitCampaignForDraft', [firstKey, planHash, 86400n, [1100000000n], [criteriaHash]]);
      const newId = originalCount.toString();
      // Inject failure after event inserts, before any projection/checkpoint commit.
      const originalSnapshot = chain.snapshot.bind(chain);
      chain.snapshot = async () => { throw new Error('Injected projection interruption'); };
      await assert.rejects(indexer.runOnce(), /Injected projection interruption/);
      const failed = await state();
      assert.equal(failed.events.length, baseline.events.length);
      assert.equal(failed.projections.length, baseline.projections.length);
      assert.equal(failed.stream.lastBlock, baseline.stream.lastBlock);
      chain.snapshot = originalSnapshot;
      // A wrong canonical end hash must also roll back the inserted events.
      let endReads = 0;
      Object.defineProperty(chain, 'client', { value: { ...fork, getBlock: async args => {
        const block = await fork.getBlock(args);
        if (args?.blockNumber === first.blockNumber && ++endReads >= 2) return { ...block, hash: hash() };
        return block;
      } }, configurable: true });
      await assert.rejects(indexer.runOnce());
      assert.equal((await state()).events.length, baseline.events.length);
      Object.defineProperty(chain, 'client', { value: fork, configurable: true });
      await catchUp(new AdvanceIndexerService(lab, chain));
      const branchA = await state();
      assert.ok(branchA.projections.some(p => p.onchainCampaignId === newId));
      checkpoints.push({ branch: 'A', block: first.blockNumber.toString(), hash: first.blockHash });
      assert.equal(await fork.request({ method: 'evm_revert', params: [snap] }), true);
      const second = await send('submitCampaignForDraft', [hash(), hash(), 86400n, [700000000n], [hash()]]);
      assert.notEqual(second.blockHash, first.blockHash);
      await assert.rejects(indexer.status(), e => e.getStatus() === 503);
      await catchUp(new AdvanceIndexerService(lab, chain));
      const branchB = await state();
      const orphan = branchB.events.filter(e => e.transactionHash === first.transactionHash);
      assert.ok(orphan.length > 0 && orphan.every(e => e.canonical === false));
      assert.equal(branchB.projections.find(p => p.onchainCampaignId === newId).snapshot.campaign.goal, '700000000');
      assert.equal(branchB.projections.find(p => p.onchainCampaignId === newId).metadataId, null);
      checkpoints.push({ branch: 'B', block: second.blockNumber.toString(), hash: second.blockHash });
      // Empty block still refreshes live deadlines/checkpoint without inventing a state transition.
      await fork.request({ method: 'evm_mine' });
      await catchUp(indexer);
      const advanced = await state();
      const live = advanced.projections.find(p => p.onchainCampaignId === newId);
      assert.ok(BigInt(live.snapshot.checkpoint.blockNumber) > second.blockNumber);
      assert.equal(live.snapshot.campaign.state, 'DRAFT');
      const retainedCheckpoint = advanced.stream.lastBlock;
      // Actual disposable-fork code replacement tests a same-chain/same-address incarnation mismatch.
      const originalCode = await fork.getCode({ address: manifest.contractAddress });
      const changedId = hash().slice(2);
      assert.ok(originalCode.includes(manifest.deploymentId.slice(2)), 'Immutable deploymentId must be embedded in runtime');
      await fork.request({ method: 'anvil_setCode', params: [manifest.contractAddress, originalCode.replaceAll(manifest.deploymentId.slice(2), changedId)] });
      assert.equal(await fork.getChainId(), 31338);
      await assert.rejects(indexer.runOnce(), e => e.getStatus() === 503);
      assert.equal((await state()).stream.lastBlock, retainedCheckpoint);
      await fork.request({ method: 'anvil_setCode', params: [manifest.contractAddress, originalCode] });
      await chain.verifyDeployment();
      result = { context: chain.context, originalHead: originalHead.number.toString(), forkRpc: 'http://127.0.0.1:9548',
        baselineEvents: baseline.events.length, baselineProjections: baseline.projections.length, checkpoints,
        checks: { duplicate: 'PASS', restart: 'PASS', eventProjectionRollback: 'PASS', endHashRollback: 'PASS',
          reorgReplay: 'PASS', orphanAudit: 'PASS', emptyBlockRefresh: 'PASS', liveWrongIncarnation: 'PASS' },
        databaseLab: 'OUTER_TRANSACTION_ROLLED_BACK', sourceChainModified: false };
      throw rollback;
    }).catch(error => { if (error !== rollback) throw error; });
    await source.verifyDeployment();
    assert.equal(await source.read('nextCampaignId', []), originalCount);
    assert.equal((await source.client.getBlock({ blockNumber: originalHead.number })).hash, originalHead.hash);
    atomicWrite(path.join(root, '.local/workflow-b/indexer-report.json'), result);
    console.log('Workflow B indexer real fork/DB smoke PASS:', JSON.stringify(result.checks));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
