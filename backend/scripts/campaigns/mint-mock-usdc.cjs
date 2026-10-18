const fs = require('node:fs');
const path = require('node:path');
const { createPublicClient, createWalletClient, defineChain, http, parseAbi } = require('viem');

async function main() {
  const root = path.resolve(__dirname, '../../..');
  let manifestPath = path.join(root, '.local/fundtogether/generated/campaigns-deployment.local.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Deployment manifest not found. Make sure services are running.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rpcUrl = manifest.rpcUrl || 'http://127.0.0.1:9548';
  const tokenAddress = manifest.tokenAddress;
  const tokenDecimals = manifest.tokenDecimals ?? 6;

  const recipientArg = process.argv[2];
  const amountArg = process.argv[3] || '10000';

  const chain = defineChain({
    id: manifest.chainId || 31339,
    name: 'FundTogether local',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const accounts = await client.request({ method: 'eth_accounts' });
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts found on RPC.');
  }

  const recipient = recipientArg || accounts[0];
  const parsedAmount = BigInt(amountArg) * (10n ** BigInt(tokenDecimals));

  const tokenAbi = parseAbi([
    'function mint(address to, uint256 amount) external',
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
  ]);

  const deployer = accounts[0];
  const wallet = createWalletClient({
    account: deployer,
    chain,
    transport: http(rpcUrl),
  });

  console.log(`Minting ${amountArg} MockUSDC (${parsedAmount.toString()} base units) to ${recipient}...`);
  const txHash = await wallet.writeContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: 'mint',
    args: [recipient, parsedAmount],
  });

  await client.waitForTransactionReceipt({ hash: txHash });

  const newBalance = await client.readContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: [recipient],
  });

  console.log(`Success! New balance of ${recipient}: ${Number(newBalance) / (10 ** tokenDecimals)} MockUSDC`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { main };
