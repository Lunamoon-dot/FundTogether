// Read existing synthetic B fixtures for browser rendering tests; no wallet signing.
const fs = require('node:fs');
const path = require('node:path');
const { NestFactory } = require('@nestjs/core');
const { eq } = require('drizzle-orm');
const { guardEnvironment } = require('./guard-environment.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });
process.env.INDEXER_ENABLED = 'false'; process.env.LOG_LEVEL = 'silent';
async function main() {
  guardEnvironment(process.env);
  const from = file => require(path.join(root, 'backend/dist/src', file));
  const app = await NestFactory.createApplicationContext(from('advance/advance-app.module').AdvanceAppModule, { logger: false });
  try {
    const report = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/review-evidence-report.json')));
    const indexer = app.get(from('advance/advance-indexer.service').AdvanceIndexerService); await indexer.runOnce();
    const db = app.get(from('database/database.constants').DRIZZLE_DB), schema = from('database/schema');
    const [metadata] = await db.select().from(schema.campaignMetadata).where(eq(schema.campaignMetadata.id, report.metadataId));
    if (!metadata) throw new Error('Review smoke metadata missing');
    const userId = metadata.createdByUserId;
    const workflow = await app.get(from('advance/advance-workflow.service').AdvanceWorkflowService).campaign(metadata.id, userId);
    const draft = await app.get(from('advance/advance-campaign.service').AdvanceCampaignService).get(metadata.id, userId);
    const [organization] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, metadata.organizationId));
    const evidence = app.get(from('advance/advance-evidence.service').AdvanceEvidenceService);
    const blockchain = app.get(from('advance/advance-blockchain.service').AdvanceBlockchainService);
    const [resolverLink] = await db.select().from(schema.walletLinks).where(eq(schema.walletLinks.address, blockchain.context.resolver.toLowerCase()));
    if (!resolverLink) throw new Error('Synthetic resolver link missing');
    const workflows = app.get(from('advance/advance-workflow.service').AdvanceWorkflowService);
    const resolverWorkflow = await workflows.campaign(metadata.id, resolverLink.userId);
    const verification = app.get(from('advance/organization-verification.service').OrganizationVerificationService);
    const data = { syntheticBrowserFixture: true, workflow, draft, session: { userId, email: 'browser-fixture@workflow-b.invalid', roles: [], wallets: [{ address: workflow.plan.organizer, chainId: 31338 }] },
      organizations: [{ ...organization, role: 'OWNER', representativeWallet: { address: workflow.plan.organizer, chainId: 31338 } }],
      evidence: await evidence.get(metadata.id, '0', userId), original: await evidence.original(report.packageId, userId),
      publication: await evidence.publication(report.packageId, userId), resolverWorkflow,
      resolverSession: { userId: resolverLink.userId, email: 'resolver-fixture@workflow-b.invalid', roles: ['RESOLVER'], wallets: [{ address: blockchain.context.resolver, chainId: 31338 }] },
      verificationHistory: await verification.history(metadata.organizationId, resolverLink.userId),
      publicDetail: await workflows.publicCampaign(report.campaignId), events: await workflows.publicEvents(report.campaignId),
      publicRecord: await workflows.publicRecord(report.decisionHash) };
    atomicWrite(path.join(root, '.local/workflow-b/browser-fixture.json'), data);
    console.log('B synthetic browser fixture exported; no new campaign, role or transaction');
  } finally { await app.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
