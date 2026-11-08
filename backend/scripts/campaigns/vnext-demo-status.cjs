const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('dotenv');
const { Pool } = require('pg');
const { isVNextDemoReady, probeVNextFrontend, probeVNextRpc } = require('./vnext-demo-readiness.cjs');

const root = path.resolve(__dirname, '../../..');
const environmentPath = process.argv[2] || path.join(root, '.local/fundtogether/vnext-demo.env');
const manifestPath = process.argv[3] || path.join(root, '.local/fundtogether/generated/vnext-deployment.local.json');
const apiPort = process.argv[4] || '3002';
const webPort = process.argv[5] || '5187';
const launcherStatePath = process.argv[6];

async function probe(url) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const body = await response.json().catch(() => undefined);
    return { ok: response.ok, status: response.status, milliseconds: Math.round(performance.now() - startedAt), body };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function main() {
  const environment = parse(fs.readFileSync(environmentPath, 'utf8'));
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : undefined;
  const api = await probe(`http://127.0.0.1:${apiPort}/health`);
  const frontend = await probeVNextFrontend(`http://127.0.0.1:${webPort}`);
  const minio = await probe(`${environment.S3_ENDPOINT}/minio/health/ready`);
  const rpc = await probeVNextRpc(environment.FUNDTOGETHER_RPC_URL);

  let database;
  const pool = new Pool({ connectionString: environment.DATABASE_URL, connectionTimeoutMillis: 4000 });
  try {
    const streamId = manifest && `vnext:${manifest.chainId}:${manifest.campaignEscrow}:${manifest.genesisHash}`;
    const stream = streamId
      ? (await pool.query('SELECT last_block, head_block, status, updated_at FROM indexer_streams WHERE stream_id = $1', [streamId])).rows[0]
      : undefined;
    const campaignCount = streamId
      ? Number((await pool.query('SELECT count(*) FROM vnext_campaign_projections WHERE stream_id = $1', [streamId])).rows[0].count)
      : 0;
    const campaigns = streamId
      ? (await pool.query('SELECT onchain_campaign_id, state, raised, paid_out, refunded FROM vnext_campaign_projections WHERE stream_id = $1 ORDER BY updated_at DESC LIMIT 8', [streamId])).rows
      : [];
    const lag = stream?.last_block != null && stream?.head_block != null
      ? (BigInt(stream.head_block) - BigInt(stream.last_block)).toString()
      : undefined;
    database = { ok: true, campaignCount, indexer: stream ? { status: stream.status, checkpoint: stream.last_block, head: stream.head_block, lag, updatedAt: stream.updated_at } : null, recentCampaigns: campaigns };
  } catch (error) {
    database = { ok: false, error: error.message };
  } finally {
    await pool.end();
  }

  let identity;
  if (manifest) {
    try {
      const deployment = require('../../dist/src/blockchain/vnext-deployment.js');
      const parsed = deployment.parseVNextDeploymentManifest(manifest);
      await deployment.verifyVNextDeployment(deployment.vnextClient(parsed), parsed);
      identity = { ok: true, protocolKind: parsed.protocolKind, chainId: parsed.chainId, rpcUrl: parsed.rpcUrl, campaignEscrow: parsed.campaignEscrow, juryRegistry: parsed.juryRegistry, juryReview: parsed.juryReview, tokenAddress: parsed.tokenAddress };
    } catch (error) {
      identity = { ok: false, error: error.message };
    }
  } else {
    identity = { ok: false, error: 'VNext manifest is missing' };
  }

  const acceptancePath = path.join(root, '.local/fundtogether/runtime/vnext-browser-e2e.json');
  const acceptanceCandidate = fs.existsSync(acceptancePath) ? JSON.parse(fs.readFileSync(acceptancePath, 'utf8')) : undefined;
  const acceptance = acceptanceCandidate?.genesisHash === manifest?.genesisHash ? acceptanceCandidate : undefined;
  let startupMs;
  if (launcherStatePath && fs.existsSync(launcherStatePath)) {
    startupMs = JSON.parse(fs.readFileSync(launcherStatePath, 'utf8')).startupMs;
  }
  const report = {
    status: isVNextDemoReady({ api, frontend, minio, rpc, database, identity }) ? 'READY' : 'DEGRADED',
    startupMs,
    urls: { frontend: `http://127.0.0.1:${webPort}`, apiHealth: `http://127.0.0.1:${apiPort}/health`, rpc: environment.FUNDTOGETHER_RPC_URL, minio: environment.S3_ENDPOINT },
    api,
    frontend: { ok: frontend.ok, status: frontend.status, milliseconds: frontend.milliseconds },
    rpc,
    minio: { ok: minio.ok, status: minio.status },
    database,
    identity,
    recentAcceptance: acceptance && { status: acceptance.status, campaignId: acceptance.campaignId, refundCampaignId: acceptance.refundCampaignId, transactionHashes: acceptance.measurements?.transactionHashes },
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'READY') process.exitCode = 1;
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'DEGRADED', error: error.message }, null, 2));
  process.exitCode = 1;
});
