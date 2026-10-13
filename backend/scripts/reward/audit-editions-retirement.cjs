// Read-only by default. --approve-fixture-archive records a narrowly verified local fixture audit.
// Never transfers tokens, decrypts shipping data, deletes records, or resets the chain.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { createPublicClient, defineChain, http, parseEventLogs } = require('viem');
const { artifacts, verifyDeployment } = require('./generate-artifacts.cjs');
async function main() {
  const root = path.resolve(__dirname, '../../..');
  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.local/reward/backend.env')));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.local/reward/generated/deployment.local.json')));
  const { reward, token } = artifacts(root);
  const chain = defineChain({ id: 31339, name: 'Reward audit', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });
  const rpc = createPublicClient({ chain, transport: http() });
  await verifyDeployment(rpc, manifest, reward.abi, token.abi);
  const db = new Client({ connectionString: env.DATABASE_URL }); await db.connect();
  try {
    const retired = (await db.query("SELECT to_regclass('reward_archive.entitlement_delivery') AS archive")).rows[0].archive;
    if (retired) {
      const counts = (await db.query('SELECT count(*)::int AS archived_delivery_records FROM reward_archive.entitlement_delivery')).rows[0];
      console.log(JSON.stringify({ state: 'PHYSICAL_RETIRED', ...counts, audit: '.local/reward/verification/editions-retirement-audit.json' })); return;
    }
    await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const physical = (await db.query(`SELECT e.*, md5(row_to_json(e)::text) AS row_hash,
      c.title,c.commitment_hash, c.draft_config,
      cu.email ~ '^test_[0-9a-f]{16}@fundtogether.local$' AS fixture_creator,
      bu.email ~ '^test_[0-9a-f]{16}@fundtogether.local$' AS fixture_backer,
      t.tier_index,t.is_digital,t.price,t.max_quantity,
      p.stream_id,p.onchain_campaign_id,
      EXISTS(SELECT 1 FROM reward_disputes d WHERE d.entitlement_id=e.id AND d.status='OPEN') AS open_dispute
      FROM reward_entitlements e JOIN reward_tiers t ON t.id=e.tier_id JOIN reward_campaigns c ON c.id=e.campaign_id
      JOIN users cu ON cu.id=c.creator_user_id JOIN users bu ON bu.id=e.backer_user_id
      LEFT JOIN reward_campaign_projection p ON p.campaign_metadata_id=c.id WHERE t.is_digital=false ORDER BY e.id`)).rows;
    const records = [];
    for (const item of physical) {
      const address = /^REWARD:31339:(0x[0-9a-f]{40})$/.exec(item.stream_id || '')?.[1];
      const result = { id: item.id, campaignId: item.campaign_id, contractAddress: address, onchainCampaignId: item.onchain_campaign_id,
        databaseStatus: item.status, rowHash: item.row_hash, hasAddress: !!(item.shipping_address || item.shipping_encrypted), hasTracking: !!item.carrier_tracking_code,
        receipt: 'UNVERIFIED', fixtureVerified: false, openDispute: item.open_dispute };
      try {
        if (!address) throw new Error('No unique deployment mapping');
        const receipt = await rpc.getTransactionReceipt({ hash: item.tx_hash });
        const block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
        const logs = parseEventLogs({ abi: reward.abi, logs: receipt.logs.filter(log => log.address.toLowerCase() === address), eventName: 'RewardPledged', strict: true });
        const pledge = logs.find(log => log.logIndex === item.log_index && String(log.args.campaignId) === item.onchain_campaign_id && log.args.backer.toLowerCase() === item.backer_wallet.toLowerCase() && String(log.args.tierId) === String(item.tier_index) && String(log.args.amount) === item.amount_paid && String(log.args.quantity) === String(item.quantity));
        if (receipt.status !== 'success' || block.hash !== receipt.blockHash || !pledge) throw new Error('Unmatched canonical pledge');
        result.receipt = 'CANONICAL_PLEDGE';
        const read = (functionName, args=[]) => rpc.readContract({ address, abi: reward.abi, functionName, args });
        const campaign = await read('campaign', [BigInt(item.onchain_campaign_id)]);
        const tier = await read('tier', [BigInt(item.onchain_campaign_id), BigInt(item.tier_index)]);
        const tokenAddress = await read('supportedToken');
        const balance = await rpc.readContract({ address: tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [address] });
        let refundClaim = 'REVERTS';
        try { await rpc.simulateContract({ address, abi: reward.abi, functionName: 'claimRefund', args: [BigInt(item.onchain_campaign_id)], account: item.backer_wallet }); refundClaim = 'CALLABLE'; } catch (error) { if (!String(error).includes('revert')) throw error; }
        result.chain = { state: Number(campaign.state), contributed: String(campaign.contributed), available: String(campaign.available), grossPaid: String(campaign.grossPaid), refunded: String(campaign.refunded), refundSnapshotted: campaign.refundSnapshotted, tokenBalance: String(balance), refundClaim };
        result.fixtureVerified = item.fixture_creator && item.fixture_backer && item.title === 'Neon City Chronicles: Volume 1' && !item.draft_config && !item.open_dispute
          && address !== manifest.contractAddress.toLowerCase() && campaign.commitmentHash.toLowerCase() === item.commitment_hash.toLowerCase()
          && campaign.creator.toLowerCase() === '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
          && item.backer_wallet.toLowerCase() === '0x90f79bf6eb2c4f870365e785982e1f101e93b906'
          && tier.isDigital === false && String(tier.price) === '100000000' && String(tier.maxQuantity) === '200'
          && item.quantity === 1 && item.amount_paid === '100000000' && Number(campaign.state) === 4;
      } catch (error) { result.error = error.shortMessage || error.message; }
      records.push(result);
    }
    const productCampaigns = String(await rpc.readContract({ address: manifest.contractAddress, abi: reward.abi, functionName: 'nextCampaignId' }));
    const totals = (await db.query(`SELECT (SELECT count(*)::int FROM reward_campaigns WHERE draft_config IS NULL) AS legacy_campaigns, (SELECT count(*)::int FROM reward_entitlements) AS legacy_entitlements`)).rows[0];
    const untrackedShipping = Number((await db.query(`SELECT count(*) FROM reward_entitlements e JOIN reward_tiers t ON t.id=e.tier_id WHERE t.is_digital AND (num_nonnulls(e.shipping_encrypted,e.shipping_iv,e.shipping_tag,e.shipping_updated_at,e.shipping_full_name,e.shipping_address,e.shipping_phone,e.carrier_tracking_code,e.delivered_at,e.confirmed_at)>0)`)).rows[0].count);
    const eligible = new Set(records.map(r=>r.id)).size === records.length && records.every(r=>r.fixtureVerified) && productCampaigns === '0' && untrackedShipping === 0;
    const report = { auditedAt: new Date().toISOString(), chainId: 31339, genesisHash: manifest.genesisHash, productContract: manifest.contractAddress, productCampaigns, untrackedShipping, ...totals,
      decision: eligible ? 'ARCHIVE_VERIFIED_LOCAL_TEST_FIXTURES' : 'BLOCKED_UNRECONCILED_OBLIGATIONS',
      retention: 'Preserve encrypted delivery data, batches, disputes and all financial/event history indefinitely. No refund or transfer is implied by archival.', records };
    if (process.argv.includes('--approve-fixture-archive')) {
      if (!eligible) throw new Error('Reconciliation failed; archive approval not written');
      await db.query(`CREATE TABLE IF NOT EXISTS reward_physical_retirement_approvals (entitlement_id uuid PRIMARY KEY, row_hash text NOT NULL, evidence jsonb NOT NULL, approved_at timestamptz NOT NULL DEFAULT now())`);
      for (const record of records) await db.query(`INSERT INTO reward_physical_retirement_approvals(entitlement_id,row_hash,evidence) VALUES($1,$2,$3) ON CONFLICT(entitlement_id) DO UPDATE SET row_hash=EXCLUDED.row_hash,evidence=EXCLUDED.evidence,approved_at=now()`, [record.id, record.rowHash, JSON.stringify({ ...record, genesisHash: manifest.genesisHash })]);
    }
    await db.query('COMMIT');
    const file = path.join(root, '.local/reward/verification/editions-retirement-audit.json'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
