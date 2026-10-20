const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { createPublicClient, createWalletClient, defineChain, http, parseAbi } = require('viem');

const ACCOUNT_DEFINITIONS = [
  {
    roleName: 'Admin',
    email: 'admin@fundtogether.com',
    accountIndex: 0,
    platformRoles: ['ADMIN'],
    targetMockUsdc: 10000n,
  },
  {
    roleName: 'Primary Resolver',
    email: 'resolver@fundtogether.com',
    accountIndex: 1,
    platformRoles: ['RESOLVER'],
    targetMockUsdc: 10000n,
  },
  {
    roleName: 'Backup Resolver',
    email: 'backup-resolver@fundtogether.com',
    accountIndex: 2,
    platformRoles: ['RESOLVER'],
    targetMockUsdc: 10000n,
  },
  {
    roleName: 'Creator',
    email: 'creator@fundtogether.com',
    accountIndex: 3,
    platformRoles: [],
    targetMockUsdc: 10000n,
  },
  {
    roleName: 'Backer 1',
    email: 'backer1@fundtogether.com',
    accountIndex: 4,
    platformRoles: [],
    targetMockUsdc: 10000n,
  },
  {
    roleName: 'Backer 2',
    email: 'backer2@fundtogether.com',
    accountIndex: 5,
    platformRoles: [],
    targetMockUsdc: 10000n,
  },
  {
    roleName: 'Judge 1',
    email: 'judge1@fundtogether.com',
    accountIndex: 6,
    platformRoles: ['JUDGE'],
    targetMockUsdc: 10000n,
  },
  {
    roleName: 'Judge 2',
    email: 'judge2@fundtogether.com',
    accountIndex: 7,
    platformRoles: ['JUDGE'],
    targetMockUsdc: 10000n,
  },
  {
    roleName: 'Judge 3',
    email: 'judge3@fundtogether.com',
    accountIndex: 8,
    platformRoles: ['JUDGE'],
    targetMockUsdc: 10000n,
  },
  {
    roleName: 'Judge 4',
    email: 'judge4@fundtogether.com',
    accountIndex: 9,
    platformRoles: ['JUDGE'],
    targetMockUsdc: 10000n,
  },
];

function loadAccounts() {
  return ACCOUNT_DEFINITIONS;
}

function loadEnvConfig(root) {
  let dbUrl = process.env.DATABASE_URL;
  let rpcUrl = process.env.FUNDTOGETHER_RPC_URL;

  const envFile = path.join(root, '.local/fundtogether/backend.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (key === 'DATABASE_URL' && !dbUrl) dbUrl = val;
        if (key === 'FUNDTOGETHER_RPC_URL' && !rpcUrl) rpcUrl = val;
      }
    }
  }

  let manifestPath = path.join(root, '.local/fundtogether/generated/campaigns-deployment.local.json');

  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      // Ignored
    }
  }

  const finalRpc = rpcUrl || (manifest && manifest.rpcUrl) || 'http://127.0.0.1:9548';
  const tokenAddress = (manifest && manifest.tokenAddress) || '0x5fbdb2315678afecb367f032d93f642f64180aa3';
  const tokenDecimals = (manifest && manifest.tokenDecimals) ?? 6;
  const chainId = (manifest && manifest.chainId) ?? 31339;

  return {
    databaseUrl: dbUrl || (() => { throw new Error('DATABASE_URL is missing; run initialize-environment.cjs first'); })(),
    rpcUrl: finalRpc,
    tokenAddress,
    tokenDecimals,
    chainId,
    resolver: manifest?.resolver || null,
    backupResolver: manifest?.backupResolver || null,
    judges: manifest?.judges || null,
  };
}

function assertDeploymentRoles(config, rpcAccounts) {
  const checks = [
    ['Primary Resolver', config.resolver, rpcAccounts[1]],
    ['Backup Resolver', config.backupResolver, rpcAccounts[2]],
  ];
  for (const [label, configured, actual] of checks) {
    if (configured && configured.toLowerCase() !== actual.toLowerCase()) {
      throw new Error(`${label} wallet does not match the Campaign deployment; reset and redeploy the local chain before seeding accounts`);
    }
  }
  if (!Array.isArray(config.judges) || config.judges.length !== 4) {
    throw new Error('Campaign deployment does not define the four local Judge wallets; reset and redeploy the local chain before seeding accounts');
  }
  for (let index = 0; index < config.judges.length; index++) {
    if (config.judges[index].toLowerCase() !== rpcAccounts[index + 6].toLowerCase()) {
      throw new Error(`Judge ${index + 1} wallet does not match the Campaign deployment; reset and redeploy the local chain before seeding accounts`);
    }
  }
}

function writeLocalAccountsMarkdown(root, config, accounts) {
  const file = path.join(root, '.local/fundtogether/LOCAL_ACCOUNTS.md');
  const rows = accounts.map(account =>
    `| ${account.accountIndex} | ${account.roleName} | \`${account.email}\` | \`${account.address}\` | ${config.chainId} |`
  ).join('\n');
  const content = `# FundTogether local wallet accounts

> LOCAL ONLY. Wallet addresses are public fixture identifiers. Never put private keys or seed phrases here.

| Index | Role | Email label | Linked wallet | Chain ID |
|---:|---|---|---|---:|
${rows}

Use the matching unlocked Anvil wallet at \`http://localhost:5175/#/account\` and sign the SIWE message.
The email column is metadata for fixture identification; it is not a login credential.
`;
  fs.writeFileSync(file, content, { mode: 0o600 });
  return file;
}

async function seedDatabase(config, accounts) {
  console.log(`\n[Database] Connecting to PostgreSQL at ${config.databaseUrl.replace(/:[^:@]+@/, ':***@')}...`);
  const db = new Client({ connectionString: config.databaseUrl });
  await db.connect();

  try {
    for (const acc of accounts) {
      let userRes = await db.query('SELECT id FROM users WHERE email = $1', [acc.email]);
      let userId;
      if (userRes.rows.length === 0) {
        const insertRes = await db.query(
          'INSERT INTO users (email, password_hash) VALUES ($1, NULL) RETURNING id',
          [acc.email]
        );
        userId = insertRes.rows[0].id;
        console.log(`  + Created user: ${acc.email} (${userId})`);
      } else {
        userId = userRes.rows[0].id;
        await db.query('UPDATE users SET password_hash = NULL WHERE id = $1', [userId]);
        console.log(`  ✓ Updated user: ${acc.email} (${userId})`);
      }

      if (acc.platformRoles && acc.platformRoles.length > 0) {
        await db.query(
          `INSERT INTO platform_roles (user_id, roles) VALUES ($1, $2::jsonb)
           ON CONFLICT (user_id) DO UPDATE SET roles = $2::jsonb, updated_at = now()`,
          [userId, JSON.stringify(acc.platformRoles)]
        );
        console.log(`    Role: [${acc.platformRoles.join(', ')}]`);
      } else {
        await db.query('DELETE FROM platform_roles WHERE user_id = $1', [userId]);
        console.log('    Role: []');
      }

      const normalizedAddress = acc.address.toLowerCase();
      await db.query(
        `DELETE FROM wallet_links stale
         WHERE stale.user_id = $1 AND stale.chain_id = $2 AND stale.address <> $3
           AND NOT EXISTS (
             SELECT 1 FROM campaigns locked_campaign
             WHERE locked_campaign.payout_wallet_link_id = stale.id
           )`,
        [userId, String(config.chainId), normalizedAddress]
      );
      await db.query(
        `INSERT INTO wallet_links (user_id, chain_id, address, is_primary)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (chain_id, address) DO UPDATE SET user_id = $1, is_primary = true`,
        [userId, String(config.chainId), normalizedAddress]
      );
      console.log(`    Linked wallet: ${acc.address} (chain ${config.chainId})`);
    }
  } finally {
    await db.end();
  }
}

async function seedBlockchain(config, accounts) {
  console.log(`\n[Blockchain] Connecting to Anvil RPC at ${config.rpcUrl}...`);
  const chain = defineChain({
    id: config.chainId,
    name: 'FundTogether Local',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });

  const client = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const rpcAccounts = await client.request({ method: 'eth_accounts' });
  if (!rpcAccounts || rpcAccounts.length === 0) {
    throw new Error('No accounts returned from RPC. Is Anvil running?');
  }

  const deployer = rpcAccounts[0];
  const wallet = createWalletClient({
    account: deployer,
    chain,
    transport: http(config.rpcUrl),
  });

  const tokenAbi = parseAbi([
    'function mint(address to, uint256 amount) external',
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ]);

  const unitMultiplier = 10n ** BigInt(config.tokenDecimals);

  console.log(`  Token Contract: ${config.tokenAddress} (Decimals: ${config.tokenDecimals})`);
  console.log(`  Deployer / Minter: ${deployer}\n`);

  for (const acc of accounts) {
    const ethBalance = await client.getBalance({ address: acc.address });
    const usdcBalance = await client.readContract({
      address: config.tokenAddress,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [acc.address],
    });

    const targetBaseUnits = acc.targetMockUsdc * unitMultiplier;
    let mintedAmount = 0n;

    if (usdcBalance < targetBaseUnits) {
      mintedAmount = targetBaseUnits - usdcBalance;
      const txHash = await wallet.writeContract({
        address: config.tokenAddress,
        abi: tokenAbi,
        functionName: 'mint',
        args: [acc.address, mintedAmount],
      });
      await client.waitForTransactionReceipt({ hash: txHash });
    }

    const finalUsdcBalance = await client.readContract({
      address: config.tokenAddress,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [acc.address],
    });

    const ethFormatted = (Number(ethBalance) / 1e18).toFixed(2);
    const usdcFormatted = (Number(finalUsdcBalance) / 10 ** config.tokenDecimals).toLocaleString();

    console.log(
      `  [${acc.roleName}] ${acc.address}\n    ETH: ${ethFormatted} ETH | MockUSDC: ${usdcFormatted} USDC ${mintedAmount > 0n ? `(+${(Number(mintedAmount) / 10 ** config.tokenDecimals).toLocaleString()} minted)` : '(sufficient)'}`
    );
  }
}

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const config = loadEnvConfig(root);
  const chain = defineChain({
    id: config.chainId,
    name: 'FundTogether Local',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const rpcAccounts = await publicClient.request({ method: 'eth_accounts' });
  if (!rpcAccounts || rpcAccounts.length < ACCOUNT_DEFINITIONS.length) throw new Error('Anvil returned too few unlocked accounts');
  assertDeploymentRoles(config, rpcAccounts);
  const accounts = loadAccounts().map(definition => ({ ...definition, address: rpcAccounts[definition.accountIndex] }));

  console.log('===============================================================');
  console.log(' FundTogether: Local Accounts Seeding & Token Provisioning');
  console.log('===============================================================');

  await seedDatabase(config, accounts);
  await seedBlockchain(config, accounts);
  const localAccountsMarkdown = writeLocalAccountsMarkdown(root, config, accounts);

  console.log('\n===============================================================');
  console.log(' All accounts are ready in PostgreSQL and funded on Anvil!');
  console.log(` Wallet login fixture summary: ${localAccountsMarkdown}`);
  console.log('===============================================================\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[Error during seeding]:', err);
    process.exit(1);
  });
}

module.exports = { ACCOUNT_DEFINITIONS, assertDeploymentRoles, loadAccounts, main };
