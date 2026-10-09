const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { once } = require('node:events');
const { createPublicClient, createWalletClient, http, keccak256, toHex } = require('viem');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { eq } = require('drizzle-orm');
const { ConfigService } = require('@nestjs/config');
const { S3Client, CreateBucketCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');
const { startFork } = require('./journey-smoke.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const { guardEnvironment } = require('./guard-environment.cjs');
const root = path.resolve(__dirname, '../../..'), from = file => require(path.join(root, 'backend/dist/src', file));
const container = 'fundtogether-workflow-b-postgres-1';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const serial = value => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);

async function main() {
  guardEnvironment(process.env);
  const { AdvanceBlockchainService } = from('advance/advance-blockchain.service');
  const { AdvanceIndexerService } = from('advance/advance-indexer.service');
  const { EvidenceStorageService } = from('modules/evidence/evidence-storage.service');
  const schema = from('database/schema');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/generated/deployment.local.json'), 'utf8'));
  const source = new AdvanceBlockchainService(manifest); await source.verifyDeployment();
  const sourceHead = await source.client.getBlock(), sourceCount = await source.read('nextCampaignId', []);
  const label = `run-${randomUUID()}`, dir = path.join(root, '.local/workflow-b/recovery', label);
  fs.mkdirSync(dir, { recursive: true });
  // A copied, atomic B snapshot contains historical blocks and complete account storage.
  const sourceState = path.join(root, '.local/workflow-b/anvil/state.json');
  const savedState = path.join(dir, 'state.json');
  fs.copyFileSync(sourceState, savedState, fs.constants.COPYFILE_EXCL);
  const state = JSON.parse(fs.readFileSync(savedState, 'utf8'));
  assert.ok(state.blocks.length > 0 && state.accounts[manifest.contractAddress.toLowerCase()], 'Complete B snapshot required');
  const native = spawnSync('wsl.exe', ['-d', 'Ubuntu-24.04', '--exec', 'wslpath', '-a', savedState], { encoding: 'utf8', windowsHide: true });
  assert.equal(native.status, 0);
  const dbName = 'fundtogether_workflow_b_recovery_' + randomUUID().replaceAll('-', '');
  assert.match(dbName, /^fundtogether_workflow_b_recovery_[a-f0-9]{32}$/);
  const metadata = spawnSync('docker', ['inspect', container, '--format', '{{index .Config.Labels "com.docker.compose.project"}}'], { encoding: 'utf8', windowsHide: true });
  assert.equal(metadata.status, 0); assert.equal(metadata.stdout.trim(), 'fundtogether-workflow-b');
  function docker(args) {
    const r = spawnSync('docker', ['exec', container, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(r.status, 0, r.stderr); return r.stdout;
  }
  const dumpPath = path.join(dir, 'database.dump');
  const dump = spawn('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'fundtogether_workflow_b', '-Fc'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let dumpError = ''; dump.stderr.on('data', b => { dumpError += b; });
  const dumped = once(dump, 'exit'); await pipeline(dump.stdout, fs.createWriteStream(dumpPath, { flags: 'wx' }));
  assert.equal((await dumped)[0], 0, dumpError);
  docker(['createdb', '-U', 'postgres', dbName]);
  let fork, pool, restoredStorage, s3;
  const objects = [], bucket = 'workflow-b-recovery-' + randomUUID();
  const report = { testedAt: new Date().toISOString(), context: source.context, mode: 'ISOLATED_BACKUP_RESTORE', checks: [],
    backups: { folder: path.relative(root, dir), stateSha256: digest(fs.readFileSync(savedState)), databaseSha256: digest(fs.readFileSync(dumpPath)) }, manual: false };
  const check = name => { report.checks.push(name); console.log(name); };
  const config = from('config/env.config').configuration();
  const originalStorage = new EvidenceStorageService(new ConfigService(config));
  try {
    const restore = spawn('docker', ['exec', '-i', container, 'pg_restore', '-U', 'postgres', '-d', dbName, '--exit-on-error', '--no-owner'], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let restoreError = ''; restore.stderr.on('data', b => { restoreError += b; });
    const restored = once(restore, 'exit'); await pipeline(fs.createReadStream(dumpPath), restore.stdin);
    assert.equal((await restored)[0], 0, restoreError);
    const dbUrl = new URL(process.env.DATABASE_URL); dbUrl.pathname = '/' + dbName;
    pool = new Pool({ connectionString: dbUrl.toString() }); const db = drizzle(pool, { schema });
    fork = await startFork(native.stdout.trim());
    const client = createPublicClient({ chain: source.client.chain, transport: http('http://127.0.0.1:9548', { retryCount: 0 }), pollingInterval: 50 });
    const chain = new AdvanceBlockchainService(manifest); Object.defineProperty(chain, 'client', { value: client });
    await chain.verifyDeployment();
    const restoredHead = await client.getBlock();
    assert.equal(restoredHead.number.toString(), String(state.best_block_number));
    assert.equal((await source.client.getBlock({ blockNumber: restoredHead.number })).hash, restoredHead.hash);
    check('Cold Anvil process restored complete B snapshot with matching genesis/code/anchor/deployment and canonical head');
    const indexer = new AdvanceIndexerService(db, chain);
    async function sync() { for (let i = 0; i < 100; i++) { await indexer.runOnce(); if ((await indexer.status()).status === 'ready') return; } throw new Error('Recovery indexer did not catch up'); }
    await sync();
    let projections = await db.select().from(schema.advanceCampaignProjection).where(eq(schema.advanceCampaignProjection.streamId, indexer.streamKey));
    for (const p of projections) {
      const actual = await chain.snapshot(BigInt(p.onchainCampaignId), BigInt(p.snapshot.checkpoint.blockNumber));
      assert.deepEqual(actual.campaign, p.snapshot.campaign); assert.deepEqual(actual.stages, p.snapshot.stages);
    }
    const dbEvents = await db.select().from(schema.chainEvents).where(eq(schema.chainEvents.streamId, indexer.streamKey));
    check('Actual pg_dump/pg_restore into disposable B database; restored checkpoint/projections agree with snapshot chain');

    s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    restoredStorage = new EvidenceStorageService(new ConfigService({ ...config, s3Bucket: bucket }));
    const packages = await db.select().from(schema.evidencePackages);
    const publications = await db.select().from(schema.evidencePublications);
    const documents = new Map();
    for (const row of [...packages, ...publications]) {
      const p = JSON.parse(row.manifestBytes);
      if (p.context?.deploymentId !== manifest.deploymentId) continue;
      assert.equal('0x' + digest(Buffer.from(row.manifestBytes)), row.evidenceHash ?? row.hash);
      for (const doc of p.documents) documents.set(doc.storageObjectId, doc);
    }
    assert.ok(documents.size > 0);
    for (const [id, doc] of documents) {
      const response = await originalStorage.get(id), bytes = Buffer.from(await response.Body.transformToByteArray());
      assert.equal('0x' + digest(bytes), doc.sha256); assert.equal(bytes.length, doc.byteSize);
      const backup = path.join(dir, `object-${digest(Buffer.from(id))}.bin`);
      fs.writeFileSync(backup, bytes, { flag: 'wx' });
      await restoredStorage.put(id, fs.readFileSync(backup), doc.mediaType); objects.push(id);
      const restoredObject = await restoredStorage.get(id);
      assert.equal(digest(Buffer.from(await restoredObject.Body.transformToByteArray())), digest(bytes));
    }
    await restoredStorage.verifyPrivateBucket();
    report.backups.objects = objects.length;
    check('Original/redacted bytes backed up and restored to private disposable bucket; manifest/hash/size match');
    const victim = documents.values().next().value;
    await restoredStorage.remove(victim.storageObjectId);
    await assert.rejects(restoredStorage.get(victim.storageObjectId));
    const backup = path.join(dir, `object-${digest(Buffer.from(victim.storageObjectId))}.bin`);
    await restoredStorage.put(victim.storageObjectId, fs.readFileSync(backup), victim.mediaType);
    assert.equal('0x' + digest(Buffer.from(await (await restoredStorage.get(victim.storageObjectId)).Body.transformToByteArray())), victim.sha256);
    check('Missing stored object fails and recovers from exact saved bytes without changing evidence hash');

    // Only9548 is reset. Original9547 and restored database checkpoints remain intact.
    const retained = (await db.select().from(schema.indexerStreams).where(eq(schema.indexerStreams.streamId, indexer.streamKey)))[0];
    await client.request({ method: 'anvil_reset', params: [] });
    assert.equal(await client.getChainId(), 31338);
    assert.equal(await client.getCode({ address: manifest.contractAddress }) ?? '0x', '0x');
    await assert.rejects(chain.verifyDeployment(), e => e.getStatus() === 503);
    await assert.rejects(indexer.runOnce(), e => e.getStatus() === 503);
    const rejected = (await db.select().from(schema.indexerStreams).where(eq(schema.indexerStreams.streamId, indexer.streamKey)))[0];
    assert.equal(rejected.lastBlock, retained.lastBlock); assert.equal(rejected.lastBlockHash, retained.lastBlockHash);
    check('Actual anvil_reset with same chain ID rejects empty incarnation and preserves database checkpoint');
    await fork.stop(); fork = undefined;
    await assert.rejects(chain.verifyDeployment(), e => e.getStatus() === 503);
    fork = await startFork(native.stdout.trim());
    await chain.verifyDeployment(); await sync();
    projections = await db.select().from(schema.advanceCampaignProjection).where(eq(schema.advanceCampaignProjection.streamId, indexer.streamKey));
    assert.equal(projections.length, (await db.select().from(schema.advanceCampaignProjection)).length);
    assert.equal((await db.select().from(schema.chainEvents).where(eq(schema.chainEvents.streamId, indexer.streamKey))).length, dbEvents.length);
    assert.equal((await client.getBlock()).hash, restoredHead.hash);
    check('RPC downtime rejects reads; restarting owned node from saved state recovers identity/head and indexer without duplicate events');
    // Real lag then recovery after a block/event, scoped to the restored lab.
    const addresses = await client.request({ method: 'eth_accounts' });
    const wallet = createWalletClient({ account: addresses[1], chain: client.chain, transport: http('http://127.0.0.1:9548') });
    const hash = await wallet.writeContract({ address: manifest.contractAddress, abi: chain.abi, functionName: 'submitCampaignForDraft',
      args: [keccak256(toHex(randomUUID())), keccak256(toHex(randomUUID())), 86400n, [1n], [keccak256(toHex(randomUUID()))]] });
    const receipt = await client.waitForTransactionReceipt({ hash }); assert.equal(receipt.status, 'success');
    assert.equal((await indexer.status()).status, 'syncing'); await sync();
    assert.equal((await indexer.status()).lastIndexedBlockHash, receipt.blockHash);
    check('Restored node mines a new event; lag is visible and fresh checkpoint recovers canonically');
    await source.verifyDeployment(); assert.equal(await source.read('nextCampaignId', []), sourceCount);
    assert.equal((await source.client.getBlock({ blockNumber: sourceHead.number })).hash, sourceHead.hash);
    report.result = 'PASS'; report.restoredHead = JSON.parse(serial(restoredHead));
  } finally {
    if (restoredStorage) {
      for (const id of objects) await restoredStorage.remove(id);
      restoredStorage.onModuleDestroy();
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    }
    originalStorage.onModuleDestroy(); s3?.destroy();
    await pool?.end(); await fork?.stop();
    docker(['dropdb', '-U', 'postgres', dbName]);
  }
  atomicWrite(path.join(root, '.local/workflow-b/recovery-report.json'), report);
  console.log(`Workflow B recovery PASS: ${report.checks.length} checks, ${objects.length} restored objects; source preserved and disposable DB/bucket/node removed`);
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
