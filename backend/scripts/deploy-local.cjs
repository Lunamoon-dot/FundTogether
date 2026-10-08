// Local Anvil only: unlocked development accounts, no private keys in files.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createPublicClient, createWalletClient, http, keccak256 } = require('viem');
const { foundry } = require('viem/chains');
const root = path.resolve(__dirname, '../..');
const isolated = process.argv.includes('--isolated');
const out = path.join(root, isolated ? '.local/mvp-deployment' : 'backend/src/blockchain/generated');
const rpcUrl = isolated ? 'http://127.0.0.1:9545' : 'http://127.0.0.1:8545';
async function main() {
  const mvp = process.argv.includes('--mvp');
  const artifact = (name) => JSON.parse(fs.readFileSync(path.join(root, 'contracts/out', name + '.sol', name + '.json')));
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl), pollingInterval: 100 });
  if (await publicClient.getChainId() !== 31337) throw new Error('Anvil chain 31337 required');
  const existingPath = path.join(out, 'deployment.local.json');
  if (fs.existsSync(existingPath) && !process.argv.includes('--redeploy')) {
    const existing = JSON.parse(fs.readFileSync(existingPath));
    if (mvp && !existing.milestonePolicy) throw new Error('Existing deployment is the prototype. A new MVP deployment requires explicit --redeploy; it does not migrate existing funds.');
    const genesis = await publicClient.getBlock({ blockNumber: 0n });
    const code = await publicClient.getCode({ address: existing.contractAddress });
    const tokenCode = await publicClient.getCode({ address: existing.tokenAddress });
    if (genesis.hash !== existing.genesisHash || !code || !tokenCode || keccak256(code) !== existing.contractCodeHash || keccak256(tokenCode) !== existing.tokenCodeHash)
      throw new Error('Saved deployment is stale. Reconcile outstanding submissions before explicitly using --redeploy.');
    if (existing.deploymentBlockHash && (await publicClient.getBlock({ blockNumber: BigInt(existing.deploymentBlockNumber) })).hash !== existing.deploymentBlockHash)
      throw new Error('Saved deployment anchor changed. Restore chain state or explicitly create a new deployment; old campaign rights cannot be moved by the database.');
    console.log('Existing local deployment ready:', existing.contractAddress);
    return;
  }
  if (fs.existsSync(existingPath)) {
    const old = JSON.parse(fs.readFileSync(existingPath));
    const genesis = await publicClient.getBlock({ blockNumber: 0n });
    const oldTokenCode = await publicClient.getCode({ address: old.tokenAddress });
    if (genesis.hash === old.genesisHash && oldTokenCode && keccak256(oldTokenCode) === old.tokenCodeHash) {
      const balance = await publicClient.readContract({ address: old.tokenAddress,
        abi: artifact('MockUSDC').abi, functionName: 'balanceOf', args: [old.contractAddress] });
      if (balance > 0n) throw new Error('Existing escrow still holds tokens. Settle its obligations first or use --isolated; do not replace the active manifest.');
    }
  }
  const accounts = await publicClient.request({ method: 'eth_accounts' });
  if (!accounts[0]) throw new Error('Unlocked local account required');
  const wallet = createWalletClient({ account: accounts[0], chain: foundry, transport: http(rpcUrl) });
  const token = artifact('MockUSDC'), campaign = artifact(mvp ? 'FundTogetherMvp' : 'FundTogetherConfigured');
  async function deploy(a, args = []) {
    const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment failed');
    return receipt;
  }
  const tokenReceipt = await deploy(token);
  const tokenAddress = tokenReceipt.contractAddress;
  const instanceId = `0x${randomBytes(32).toString('hex')}`;
  const contractReceipt = await deploy(campaign, mvp ? [tokenAddress, instanceId] : [tokenAddress]);
  const contractAddress = contractReceipt.contractAddress;
  const genesis = await publicClient.getBlock({ blockNumber: 0n });
  const manifest = { chainId: 31337, rpcUrl, contractAddress, tokenAddress, tokenDecimals: 6, confirmations: 1, resolver: accounts[0], genesisHash: genesis.hash,
    contractCodeHash: keccak256(await publicClient.getCode({ address: contractAddress })), tokenCodeHash: keccak256(await publicClient.getCode({ address: tokenAddress })), atomicSubmission: true,
    deploymentBlockNumber: contractReceipt.blockNumber.toString(), deploymentBlockHash: contractReceipt.blockHash };
  if (mvp) {
    manifest.deploymentId = instanceId;
    manifest.milestonePolicy = await publicClient.readContract({ address: contractAddress, abi: campaign.abi, functionName: 'MILESTONE_POLICY' });
    manifest.recoveryPolicy = await publicClient.readContract({ address: contractAddress, abi: campaign.abi, functionName: 'RECOVERY_POLICY' });
  }
  fs.mkdirSync(out, { recursive: true });
  // Retain the previous manifest and ABI for orphaned plans/pending hashes.
  if (fs.existsSync(existingPath)) {
    const archive = path.join(root, '.local/deployment-history', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(archive, { recursive: true });
    for (const name of ['deployment.local.json', 'fund-together.abi.json', 'mock-usdc.abi.json']) {
      const old = path.join(out, name);
      if (fs.existsSync(old)) fs.copyFileSync(old, path.join(archive, name));
    }
  }
  fs.writeFileSync(path.join(out, 'mock-usdc.abi.json'), JSON.stringify(token.abi, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'fund-together.abi.json'), JSON.stringify(campaign.abi, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'deployment.local.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Local deployment:', JSON.stringify(manifest));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
