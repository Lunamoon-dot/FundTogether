const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  parseEventLogs,
  toHex,
} = require('viem');

const root = path.resolve(__dirname, '../../..');
const defaultManifestPath = path.join(root, '.local/fundtogether/generated/vnext-deployment.local.json');
const manifestPath = process.env.FUNDTOGETHER_VNEXT_MANIFEST_PATH || defaultManifestPath;
const contracts = name => JSON.parse(fs.readFileSync(path.join(root, 'contracts/out', name), 'utf8'));
const campaignArtifact = contracts('CampaignEscrowVNext.sol/CampaignEscrowVNext.json');
const registryArtifact = contracts('JuryRegistry.sol/JuryRegistry.json');
const reviewArtifact = contracts('JuryReview.sol/JuryReview.json');
const tokenArtifact = contracts('MockUSDC.sol/MockUSDC.json');

function readEnvironment(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function loadPolicy() {
  const source = fs.readFileSync(path.join(root, 'docs/protocol/parameters-v2-remediation.md'), 'utf8');
  const match = source.match(/<!-- vnext-policy-json\s*([\s\S]*?)\s*-->/);
  if (!match) throw new Error('VNext remediation policy JSON block is missing');
  return JSON.parse(match[1]);
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) throw new Error(`VNext manifest is missing: ${manifestPath}`);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function findCampaignProjection(rows, streamId, campaignId) {
  return rows.find(row => row.streamId === streamId && row.onchainCampaignId === campaignId.toString());
}

async function send(client, wallet, request) {
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== 'success') throw new Error(`VNext transaction reverted: ${request.functionName}`);
  return receipt;
}

async function expectRevert(action, label) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`VNext acceptance expected revert: ${label}`);
}

async function read(client, address, abi, functionName, args = []) {
  return client.readContract({ address, abi, functionName, args });
}

function eventArgs(receipt, abi, eventName) {
  const events = parseEventLogs({ abi, logs: receipt.logs, eventName, strict: true });
  if (!events.length) throw new Error(`VNext receipt did not emit ${eventName}`);
  return events[events.length - 1].args;
}

async function advance(client, seconds) {
  await client.request({ method: 'evm_increaseTime', params: [seconds] });
  await client.request({ method: 'evm_mine' });
}

function commitment(chainId, protocolVersion, campaignId, milestoneId, evidenceRevision, caseNumber, roundId, courtId, judge, vote, salt) {
  return keccak256(encodeAbiParameters([
    { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
    { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
    { type: 'address' }, { type: 'uint8' }, { type: 'bytes32' },
  ], [chainId, protocolVersion, campaignId, milestoneId, evidenceRevision, caseNumber, roundId, courtId, judge, vote, salt]));
}

async function resolveCourt({ client, wallets, addresses, manifest, policy, campaignId, milestoneId, evidenceRevision, caseId, votes }) {
  const requiredStake = await read(client, manifest.juryReview, reviewArtifact.abi, 'requiredCaseStake', [caseId]);
  for (const judge of addresses.judges) {
    await send(client, wallets[judge], { address: manifest.juryRegistry, abi: registryArtifact.abi, functionName: 'reserveCaseStake', args: [caseId, requiredStake] });
    await send(client, wallets[judge], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'enroll', args: [caseId] });
  }

  await advance(client, policy.judgeEnrollmentWindowSeconds + 1);
  await send(client, wallets[addresses.deployer], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'finalizeSnapshot', args: [caseId] });
  await send(client, wallets[addresses.deployer], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'assignCourt', args: [caseId, 0n] });

  const caseNumber = await read(client, manifest.juryReview, reviewArtifact.abi, 'caseNumber', [caseId]);
  const roundId = await read(client, manifest.juryReview, reviewArtifact.abi, 'reviewRound', [caseId]);
  const protocolVersion = await read(client, manifest.juryReview, reviewArtifact.abi, 'protocolVersion');
  const courtJudges = [];
  const salts = [];
  for (let slot = 0; slot < 3; slot++) {
    const judge = (await read(client, manifest.juryReview, reviewArtifact.abi, 'courtJudge', [caseId, 0n, BigInt(slot)])).toLowerCase();
    courtJudges.push(judge);
    const salt = keccak256(toHex(`fundtogether-vnext-acceptance:${caseId}:${slot}`));
    salts.push(salt);
    const vote = votes[slot];
    await send(client, wallets[judge], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'commitVote', args: [caseId, 0n, commitment(31339n, protocolVersion, campaignId, milestoneId, evidenceRevision, caseNumber, roundId, 0n, judge, vote, salt)] });
  }
  assert.equal(new Set(courtJudges).size, 3, 'reference court must have three unique Judges');

  await advance(client, policy.commitWindowSeconds + 1);
  for (let slot = 0; slot < courtJudges.length; slot++) {
    await send(client, wallets[courtJudges[slot]], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'revealVote', args: [caseId, 0n, votes[slot], salts[slot]] });
  }
  await advance(client, policy.revealWindowSeconds + 1);
  await send(client, wallets[addresses.deployer], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'finalizeCourt', args: [caseId, 0n] });
}

async function resolvePass({ client, wallets, addresses, manifest, policy, campaignId, milestoneId, evidenceRevision, caseId }) {
  await resolveCourt({ client, wallets, addresses, manifest, policy, campaignId, milestoneId, evidenceRevision, caseId, votes: [1, 1, 1] });
  await advance(client, policy.appealWindowSeconds + 1);
  await send(client, wallets[addresses.deployer], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'finalizeNoAppeal', args: [caseId] });
}

async function resolveFail({ client, wallets, addresses, manifest, policy, campaignId, milestoneId, evidenceRevision, caseId }) {
  await resolveCourt({ client, wallets, addresses, manifest, policy, campaignId, milestoneId, evidenceRevision, caseId, votes: [2, 2, 1] });
  await advance(client, policy.appealWindowSeconds + 1);
  await send(client, wallets[addresses.deployer], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'finalizeNoAppeal', args: [caseId] });
}

async function createCampaign({ client, wallet, manifest, goal, evidenceHash, duration }) {
  const fundingDeadline = (await client.getBlock({ blockTag: 'latest' })).timestamp + duration;
  const receipt = await send(client, wallet, {
    address: manifest.campaignEscrow,
    abi: campaignArtifact.abi,
    functionName: 'createCampaign',
    args: [wallet.account.address, goal, fundingDeadline, [goal], [keccak256(toHex(`acceptance:${evidenceHash}`))], evidenceHash],
  });
  const created = eventArgs(receipt, campaignArtifact.abi, 'CampaignCreated');
  return {
    id: created.campaignId,
    publicationCaseId: created.publicationReviewCaseId,
    fundingDeadline: created.fundingDeadline,
  };
}

async function fundCampaign({ client, wallets, manifest, campaignId, backers, goal, fundingDeadline }) {
  const half = goal / 2n;
  for (const [index, backer] of backers.entries()) {
    const amount = index === 0 ? half : goal - half;
    await send(client, wallets[backer], { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'contribute', args: [campaignId, amount] });
  }
  await expectRevert(
    () => send(client, wallets[backers[0]], { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'finalizeFunding', args: [campaignId] }),
    'funding cannot finalize before its deadline',
  );
  const now = (await client.getBlock({ blockTag: 'latest' })).timestamp;
  if (now <= fundingDeadline) await advance(client, Number(fundingDeadline - now + 1n));
  await send(client, wallets[backers[0]], { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'finalizeFunding', args: [campaignId] });
}

async function syncPersistentProjection({ client, manifest, campaignIds }) {
  const env = { ...readEnvironment(path.join(root, '.local/fundtogether/backend.env')), ...process.env };
  const databaseUrl = env.FUNDTOGETHER_VNEXT_DATABASE_URL || env.DATABASE_URL;
  if (!databaseUrl) throw new Error('VNext acceptance requires FUNDTOGETHER_VNEXT_DATABASE_URL or DATABASE_URL');
  const { Pool } = require('pg');
  const { drizzle } = require('drizzle-orm/node-postgres');
  const schema = require('../../dist/src/database/schema');
  const { VNextIndexerService } = require('../../dist/src/indexer/vnext-indexer.service');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });
    const indexer = new VNextIndexerService(db, { manifest, client });
    await indexer.runOnce();
    const streamId = indexer.streamId();
    const projectionSnapshot = async () => (await db.select().from(schema.vnextCampaignProjections))
      .filter(row => row.streamId === streamId && campaignIds.some(campaignId => row.onchainCampaignId === campaignId.toString()))
      .sort((left, right) => left.onchainCampaignId.localeCompare(right.onchainCampaignId))
      .map(row => ({
        onchainCampaignId: row.onchainCampaignId,
        state: row.state,
        raised: row.raised,
        paidOut: row.paidOut,
        refunded: row.refunded,
        lastEventName: row.lastEventName,
        lastBlockNumber: row.lastBlockNumber,
      }));
    for (const campaignId of campaignIds) {
      const rows = await db.select().from(schema.vnextCampaignProjections);
      const row = findCampaignProjection(rows, streamId, campaignId);
      assert.ok(row, `missing persistent projection for campaign ${campaignId}`);
      const expectedState = campaignId === campaignIds[0] ? 4 : 5;
      assert.equal(row.state, expectedState);
      if (expectedState === 4) assert.equal(row.paidOut, '100000000');
      if (expectedState === 5) assert.equal(row.refunded, '100000000');
    }
    const beforeReplay = await projectionSnapshot();
    await indexer.runOnce();
    assert.deepEqual(await projectionSnapshot(), beforeReplay, 'indexer replay changed VNext projection values');
  } finally {
    await pool.end();
  }
}

async function main() {
  const policy = loadPolicy();
  const manifest = loadManifest();
  assert.equal(manifest.protocolKind, 'FUNDTOGETHER_VNEXT');
  assert.equal(manifest.chainId, policy.chainId);
  assert.equal(manifest.tokenDecimals, policy.tokenDecimals);

  const chain = defineChain({ id: 31339, name: 'FundTogether VNext local', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });
  const client = createPublicClient({ chain, transport: http(manifest.rpcUrl), pollingInterval: 100 });
  const accounts = await client.request({ method: 'eth_accounts' });
  if (accounts.length < 9) throw new Error('VNext acceptance requires a deployer, two Backers and six Judges');
  const [deployer, backerOne, backerTwo, judgeOne, judgeTwo, judgeThree, appealJudgeOne, appealJudgeTwo, appealJudgeThree] = accounts.map(value => value.toLowerCase());
  const addresses = { deployer, judges: [judgeOne, judgeTwo, judgeThree] };
  const appealAddresses = { deployer, judges: [appealJudgeOne, appealJudgeTwo, appealJudgeThree] };
  const wallets = Object.fromEntries(accounts.map(address => [address.toLowerCase(), createWalletClient({ account: address, chain, transport: http(manifest.rpcUrl) })]));
  const policyHash = keccak256(toHex(policy.policyVersion));
  assert.equal(manifest.policyHash.toLowerCase(), policyHash.toLowerCase());

  await require('../../dist/src/blockchain/vnext-deployment.js').verifyVNextDeployment(client, manifest);
  const goal = 100000000n;
  const token = manifest.tokenAddress;
  const deployerWallet = wallets[deployer];
  for (const holder of [deployer, backerOne, backerTwo, judgeOne, judgeTwo, judgeThree, appealJudgeOne, appealJudgeTwo, appealJudgeThree]) {
    await send(client, deployerWallet, { address: token, abi: tokenArtifact.abi, functionName: 'mint', args: [holder, 200000000n] });
  }
  for (const judge of [...addresses.judges, ...appealAddresses.judges]) {
    await send(client, wallets[judge], { address: token, abi: tokenArtifact.abi, functionName: 'approve', args: [manifest.juryRegistry, 200000000n] });
    await send(client, wallets[judge], { address: manifest.juryRegistry, abi: registryArtifact.abi, functionName: 'depositStake', args: [100000000n] });
  }
  for (const backer of [backerOne, backerTwo]) {
    await send(client, wallets[backer], { address: token, abi: tokenArtifact.abi, functionName: 'approve', args: [manifest.campaignEscrow, goal] });
  }

  const first = await createCampaign({ client, wallet: deployerWallet, manifest, goal, evidenceHash: keccak256(toHex('first-publication')), duration: 30n * 24n * 60n * 60n });
  await resolvePass({ client, wallets, addresses, manifest, policy, campaignId: first.id, milestoneId: (2n ** 256n) - 1n, evidenceRevision: 1n, caseId: first.publicationCaseId });
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'finalizePublication', args: [first.id] });
  await fundCampaign({ client, wallets, manifest, campaignId: first.id, backers: [backerOne, backerTwo], goal, fundingDeadline: first.fundingDeadline });
  const milestoneReceipt = await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'submitMilestoneEvidence', args: [first.id, 0n, keccak256(toHex('first-milestone'))] });
  const milestoneCaseId = eventArgs(milestoneReceipt, campaignArtifact.abi, 'MilestoneEvidenceSubmitted').reviewCaseId;
  await resolvePass({ client, wallets, addresses, manifest, policy, campaignId: first.id, milestoneId: 0n, evidenceRevision: 1n, caseId: milestoneCaseId });
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'syncFinalRuling', args: [first.id, 0n] });
  await expectRevert(
    () => send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'resolveChallenge', args: [first.id, 0n] }),
    'challenge resolution is disabled by local policy',
  );
  await advance(client, policy.challengeWindowSeconds + 1);
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'payMilestone', args: [first.id, 0n] });
  await expectRevert(
    () => send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'payMilestone', args: [first.id, 0n] }),
    'duplicate milestone payout',
  );

  const second = await createCampaign({ client, wallet: deployerWallet, manifest, goal, evidenceHash: keccak256(toHex('second-publication')), duration: 30n * 24n * 60n * 60n });
  await resolvePass({ client, wallets, addresses, manifest, policy, campaignId: second.id, milestoneId: (2n ** 256n) - 1n, evidenceRevision: 1n, caseId: second.publicationCaseId });
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'finalizePublication', args: [second.id] });
  await fundCampaign({ client, wallets, manifest, campaignId: second.id, backers: [backerOne, backerTwo], goal, fundingDeadline: second.fundingDeadline });
  await advance(client, policy.milestoneSubmissionWindowSeconds + 1);
  await send(client, wallets[backerOne], { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'expireMilestoneSubmission', args: [second.id, 0n] });
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'freezeRefundAllocations', args: [second.id, 10n] });
  const entitlementOne = await read(client, manifest.campaignEscrow, campaignArtifact.abi, 'refundEntitlement', [second.id, backerOne]);
  const entitlementTwo = await read(client, manifest.campaignEscrow, campaignArtifact.abi, 'refundEntitlement', [second.id, backerTwo]);
  assert.equal(entitlementOne + entitlementTwo, goal);
  await send(client, wallets[backerTwo], { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'claimRefund', args: [second.id] });
  await send(client, wallets[backerOne], { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'claimRefund', args: [second.id] });
  await expectRevert(
    () => send(client, wallets[backerOne], { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'claimRefund', args: [second.id] }),
    'duplicate backer refund',
  );

  const noQuorum = await createCampaign({ client, wallet: deployerWallet, manifest, goal, evidenceHash: keccak256(toHex('no-quorum-publication')), duration: 30n * 24n * 60n * 60n });
  await advance(client, policy.judgeEnrollmentWindowSeconds + 1);
  let retryReceipt = await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'retryPublication', args: [noQuorum.id] });
  let retryCaseId = eventArgs(retryReceipt, campaignArtifact.abi, 'PublicationReviewCaseChanged').reviewCaseId;
  await advance(client, policy.judgeEnrollmentWindowSeconds + 1);
  retryReceipt = await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'retryPublication', args: [noQuorum.id] });
  retryCaseId = eventArgs(retryReceipt, campaignArtifact.abi, 'PublicationReviewCaseChanged').reviewCaseId;
  await advance(client, policy.judgeEnrollmentWindowSeconds + 1);
  await send(client, deployerWallet, { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'finalizeProtocolFailure', args: [retryCaseId] });
  assert.equal(await read(client, manifest.juryReview, reviewArtifact.abi, 'finalOutcome', [noQuorum.publicationCaseId]), 3);

  const appealCampaign = await createCampaign({ client, wallet: deployerWallet, manifest, goal, evidenceHash: keccak256(toHex('appeal-publication')), duration: 30n * 24n * 60n * 60n });
  await resolveCourt({ client, wallets, addresses, manifest, policy, campaignId: appealCampaign.id, milestoneId: (2n ** 256n) - 1n, evidenceRevision: 1n, caseId: appealCampaign.publicationCaseId, votes: [2, 2, 1] });
  await send(client, deployerWallet, { address: token, abi: tokenArtifact.abi, functionName: 'approve', args: [manifest.juryReview, 1000000n] });
  const appealReceipt = await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'openAppeal', args: [appealCampaign.id, (2n ** 256n) - 1n] });
  const appealCaseId = eventArgs(appealReceipt, campaignArtifact.abi, 'PublicationReviewCaseChanged').reviewCaseId;
  await resolvePass({ client, wallets, addresses: appealAddresses, manifest, policy, campaignId: appealCampaign.id, milestoneId: (2n ** 256n) - 1n, evidenceRevision: 1n, caseId: appealCaseId });
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'finalizePublication', args: [appealCampaign.id] });
  assert.equal(await read(client, manifest.campaignEscrow, campaignArtifact.abi, 'campaignState', [appealCampaign.id]), 1);

  const correctionCampaign = await createCampaign({ client, wallet: deployerWallet, manifest, goal, evidenceHash: keccak256(toHex('correction-publication')), duration: 30n * 24n * 60n * 60n });
  await resolvePass({ client, wallets, addresses, manifest, policy, campaignId: correctionCampaign.id, milestoneId: (2n ** 256n) - 1n, evidenceRevision: 1n, caseId: correctionCampaign.publicationCaseId });
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'finalizePublication', args: [correctionCampaign.id] });
  for (const backer of [backerOne, backerTwo]) {
    await send(client, wallets[backer], { address: token, abi: tokenArtifact.abi, functionName: 'approve', args: [manifest.campaignEscrow, goal] });
  }
  await fundCampaign({ client, wallets, manifest, campaignId: correctionCampaign.id, backers: [backerOne, backerTwo], goal, fundingDeadline: correctionCampaign.fundingDeadline });
  const failedMilestoneReceipt = await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'submitMilestoneEvidence', args: [correctionCampaign.id, 0n, keccak256(toHex('failed-milestone'))] });
  const failedMilestoneCaseId = eventArgs(failedMilestoneReceipt, campaignArtifact.abi, 'MilestoneEvidenceSubmitted').reviewCaseId;
  await resolveFail({ client, wallets, addresses, manifest, policy, campaignId: correctionCampaign.id, milestoneId: 0n, evidenceRevision: 1n, caseId: failedMilestoneCaseId });
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'syncFinalRuling', args: [correctionCampaign.id, 0n] });
  const correctionReceipt = await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'submitMilestoneEvidence', args: [correctionCampaign.id, 0n, keccak256(toHex('corrected-milestone'))] });
  const correctionArgs = eventArgs(correctionReceipt, campaignArtifact.abi, 'MilestoneEvidenceSubmitted');
  assert.equal(correctionArgs.evidenceRevision, 2n);
  const correctedCaseId = correctionArgs.reviewCaseId;
  await resolvePass({ client, wallets, addresses: appealAddresses, manifest, policy, campaignId: correctionCampaign.id, milestoneId: 0n, evidenceRevision: 2n, caseId: correctedCaseId });
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'syncFinalRuling', args: [correctionCampaign.id, 0n] });
  await advance(client, policy.challengeWindowSeconds + 1);
  await send(client, deployerWallet, { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'payMilestone', args: [correctionCampaign.id, 0n] });

  assert.equal(await read(client, manifest.campaignEscrow, campaignArtifact.abi, 'campaignState', [first.id]), 4);
  assert.equal(await read(client, manifest.campaignEscrow, campaignArtifact.abi, 'campaignPaidOut', [first.id]), goal);
  assert.equal(await read(client, manifest.campaignEscrow, campaignArtifact.abi, 'campaignState', [second.id]), 5);
  assert.equal(await read(client, manifest.campaignEscrow, campaignArtifact.abi, 'campaignRefunded', [second.id]), goal);
  assert.equal(await read(client, manifest.campaignEscrow, campaignArtifact.abi, 'campaignState', [correctionCampaign.id]), 4);
  assert.equal(await read(client, manifest.campaignEscrow, campaignArtifact.abi, 'campaignPaidOut', [correctionCampaign.id]), goal);
  assert.equal(await read(client, manifest.tokenAddress, tokenArtifact.abi, 'balanceOf', [manifest.campaignEscrow]), 0n);

  const fromBlock = BigInt(manifest.deploymentBlockNumber);
  const [campaignLogs, reviewLogs, registryLogs] = await Promise.all([
    client.getLogs({ address: manifest.campaignEscrow, fromBlock }),
    client.getLogs({ address: manifest.juryReview, fromBlock }),
    client.getLogs({ address: manifest.juryRegistry, fromBlock }),
  ]);
  const names = new Set([...campaignLogs, ...reviewLogs, ...registryLogs].map(log => {
    for (const abi of [campaignArtifact.abi, reviewArtifact.abi, registryArtifact.abi]) {
      try { const [decoded] = parseEventLogs({ abi, logs: [log], strict: true }); if (decoded) return decoded.eventName; } catch {}
    }
    return undefined;
  }).filter(Boolean));
  for (const eventName of ['MilestonePaid', 'CampaignCompleted', 'CampaignRefundsOpened', 'BackerRefundClaimed', 'ReviewRetryOpened', 'AppealOpened', 'FinalRulingEstablished', 'MilestoneRevisionSubmitted']) assert.ok(names.has(eventName), `missing canonical event ${eventName}`);

  await syncPersistentProjection({ client, manifest, campaignIds: [first.id, second.id] });
  console.log(JSON.stringify({ status: 'PASS', protocolKind: manifest.protocolKind, chainId: manifest.chainId, payoutCampaignId: first.id.toString(), refundCampaignId: second.id.toString(), contractBalance: '0' }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { commitment, findCampaignProjection, loadManifest, loadPolicy, resolvePass };
