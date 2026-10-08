// Local Anvil only. No private key, resolver authority, bond claim or donor claim.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  decodeEventLog,
} = require("viem");
const { foundry } = require("viem/chains");
const root = path.resolve(__dirname, "../..");
const identityMismatch = (message) =>
  Object.assign(new Error(message), { fatal: true });

async function dueTimeout(id, state, now, read, mvp) {
  if (state === 2) {
    const end = await read("fundingDeadlines", [id]);
    if (end > 0n && now >= end)
      return {
        functionName: "finalizeFundingFailure",
        args: [id],
        event: "FundingFinalized",
      };
  }
  if ([3, 6, 9, 11, 8].includes(state)) {
    const index = await read("currentMilestoneIndex", [id]);
    if ([3, 6, 9].includes(state)) {
      const end =
        state === 6
          ? await read("evidenceDeadlines", [id, index])
          : await read("activationDeadlines", [id]);
      if (end > 0n && now >= end)
        return {
          functionName: "finalizeMilestoneTimeout",
          args: [id, index],
          event: "CampaignFailed",
        };
    } else {
      const version = await read("submissionVersion", [id, index]);
      if (state === 11) {
        const end = await read("admissionDeadlines", [id, index, version]);
        if (end > 0n && now >= end)
          return {
            functionName: "expireSubmission",
            args: [id, index, version],
            event: "EvidenceSubmissionExpired",
          };
      } else if (mvp) {
        const dispute = await read("challengeCases", [id, index, version]);
        if (dispute[5] > 0n && now >= dispute[5] && Number(dispute[6]) === 0)
          return {
            functionName: "finalizeChallengeTimeout",
            args: [id, index, version],
            event: "ChallengeResolved",
          };
      }
    }
  }
  return null;
}

async function main() {
  const flags = process.argv.slice(2);
  const option = flags.indexOf("--deployment");
  const filename =
    option < 0
      ? path.join(
          root,
          "backend/src/blockchain/generated/deployment.local.json",
        )
      : flags[option + 1];
  if (!filename) throw new Error("--deployment requires a manifest path");
  const manifest = JSON.parse(fs.readFileSync(filename));
  if (
    !Number.isSafeInteger(manifest.confirmations) ||
    manifest.confirmations < 1
  )
    throw new Error("Valid confirmation policy required");
  const rpc = new URL(manifest.rpcUrl);
  if (
    manifest.chainId !== 31337 ||
    rpc.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(rpc.hostname) ||
    rpc.username ||
    rpc.password
  )
    throw new Error("Worker requires loopback Anvil chain 31337");
  const execute = flags.includes("--execute"),
    watch = flags.includes("--watch");
  const name = manifest.milestonePolicy
    ? "FundTogetherMvp"
    : "FundTogetherConfigured";
  const abi = JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts/out", name + ".sol", name + ".json"),
    ),
  ).abi;
  const client = createPublicClient({
    chain: foundry,
    transport: http(manifest.rpcUrl, { timeout: 8_000, retryCount: 0 }),
  });
  const wallet = execute
    ? createWalletClient({
        chain: foundry,
        transport: http(manifest.rpcUrl, { timeout: 8_000, retryCount: 0 }),
      })
    : null;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        manifest.chainId,
        manifest.contractAddress,
        manifest.genesisHash,
        manifest.contractCodeHash,
        manifest.tokenCodeHash,
        manifest.deploymentBlockHash ?? null,
      ]),
    )
    .digest("hex");
  const directory = path.join(root, ".local/timeout-worker");
  const pendingPath = path.join(directory, fingerprint + ".json");
  const pending = fs.existsSync(pendingPath)
    ? JSON.parse(fs.readFileSync(pendingPath))
    : {};
  const save = () => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(pendingPath + ".tmp", JSON.stringify(pending, null, 2));
    fs.renameSync(pendingPath + ".tmp", pendingPath);
  };
  const read = (functionName, args, blockNumber) =>
    client.readContract({
      address: manifest.contractAddress,
      abi,
      functionName,
      args,
      blockNumber,
    });
  async function verify() {
    const [id, genesis, code, tokenCode] = await Promise.all([
      client.getChainId(),
      client.getBlock({ blockNumber: 0n }),
      client.getCode({ address: manifest.contractAddress }),
      client.getCode({ address: manifest.tokenAddress }),
    ]);
    if (
      id !== manifest.chainId ||
      genesis.hash !== manifest.genesisHash ||
      !code ||
      !tokenCode ||
      keccak256(code) !== manifest.contractCodeHash ||
      keccak256(tokenCode) !== manifest.tokenCodeHash
    )
      throw identityMismatch(
        "Deployment changed; worker stopped without signing",
      );
    if (
      (manifest.deploymentBlockNumber === undefined) !==
      (manifest.deploymentBlockHash === undefined)
    )
      throw identityMismatch("Incomplete deployment anchor");
    if (
      manifest.deploymentBlockHash &&
      (
        await client.getBlock({
          blockNumber: BigInt(manifest.deploymentBlockNumber),
        })
      ).hash !== manifest.deploymentBlockHash
    )
      throw identityMismatch(
        "Deployment block changed; restore state or adopt a new manifest",
      );
    if (
      String(await read("supportedToken", [])).toLowerCase() !==
      manifest.tokenAddress.toLowerCase()
    )
      throw identityMismatch("Unsupported token");
    if (
      manifest.milestonePolicy &&
      ((await read("MILESTONE_POLICY", [])) !== manifest.milestonePolicy ||
        (await read("RECOVERY_POLICY", [])) !== manifest.recoveryPolicy ||
        (await read("deploymentId", [])) !== manifest.deploymentId)
    )
      throw identityMismatch("MVP deployment policy/instance mismatch");
  }
  async function reconcile(key) {
    const entry = pending[key];
    if (!entry.hash) {
      console.log(
        `Campaign ${key}: submission outcome unknown; inspect the sender's transactions before retrying. Record: ${pendingPath}`,
      );
      return;
    }
    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: entry.hash });
    } catch (error) {
      if (error.name === "TransactionReceiptNotFoundError") return;
      throw error;
    }
    await verify();
    const head = await client.getBlockNumber({ cacheTime: 0 });
    if (head < receipt.blockNumber + BigInt(manifest.confirmations - 1)) return;
    if (
      (await client.getBlock({ blockNumber: receipt.blockNumber })).hash !==
        receipt.blockHash ||
      receipt.to?.toLowerCase() !== manifest.contractAddress.toLowerCase() ||
      receipt.from.toLowerCase() !== entry.account.toLowerCase()
    )
      throw new Error(
        "Receipt identity is not canonical; pending record retained",
      );
    if (receipt.status === "success") {
      const matched = receipt.logs.some((log) => {
        if (
          log.address.toLowerCase() !== manifest.contractAddress.toLowerCase()
        )
          return false;
        try {
          const event = decodeEventLog({
            abi,
            data: log.data,
            topics: log.topics,
            strict: true,
          });
          return (
            event.eventName === entry.event &&
            String(event.args.campaignId) === key &&
            (entry.args.length < 2 ||
              String(event.args.milestoneIndex) === entry.args[1]) &&
            (entry.args.length < 3 ||
              String(event.args.version) === entry.args[2])
          );
        } catch {
          return false;
        }
      });
      if (!matched)
        throw new Error(
          "Expected timeout event absent; pending record retained",
        );
    }
    console.log(
      `Campaign ${key}: receipt ${receipt.status}, block ${receipt.blockNumber}; application still waits for indexer.`,
    );
    delete pending[key];
    save();
  }
  let cursor = 0n;
  do {
    try {
      // Identity failure halts the entire worker; never blindly adopt another chain.
      await verify();
      const block = await client.getBlock({ blockTag: "latest" });
      const count = await read("nextCampaignId", [], block.number);
      if (cursor >= count) cursor = 0n;
      const end = cursor + 64n < count ? cursor + 64n : count;
      for (; cursor < end; cursor++) {
        const key = cursor.toString();
        try {
          if (pending[key]) {
            if (execute) await reconcile(key);
            else
              console.log(
                `Campaign ${key}: pending worker transaction ${pending[key].hash ?? "(outcome unknown)"} (dry run)`,
              );
            continue;
          }
          const action = await dueTimeout(
            cursor,
            Number(await read("campaignState", [cursor], block.number)),
            block.timestamp,
            (name, args) => read(name, args, block.number),
            Boolean(manifest.milestonePolicy),
          );
          if (!action) continue;
          console.log(
            `Campaign ${key}: ${action.functionName}${execute ? "" : " (dry run)"}`,
          );
          if (!execute) continue;
          const [account] = await client.request({ method: "eth_accounts" });
          if (!account)
            throw new Error("Unlocked funded local caller required");
          await verify();
          const { request } = await client.simulateContract({
            address: manifest.contractAddress,
            abi,
            functionName: action.functionName,
            args: action.args,
            account,
          });
          // Persist intent BEFORE RPC write. A lost response never triggers blind resend.
          pending[key] = {
            account,
            event: action.event,
            args: action.args.map(String),
            functionName: action.functionName,
          };
          save();
          pending[key].hash = await wallet.writeContract(request);
          save();
          console.log(`Campaign ${key}: submitted ${pending[key].hash}`);
          await reconcile(key);
        } catch (error) {
          if (error.fatal) throw error;
          console.error(
            `Campaign ${key}: ${error.shortMessage ?? error.message}`,
          );
        }
      }
    } catch (error) {
      if (!watch || error.fatal) throw error;
      console.error(
        `RPC temporarily unavailable; retrying without signing: ${error.shortMessage ?? error.message}`,
      );
    }
    if (watch) await delay(15_000);
  } while (watch);
}

module.exports = { dueTimeout };
if (require.main === module)
  main().catch((error) => {
    console.error(error.shortMessage ?? error.message);
    process.exitCode = 1;
  });
