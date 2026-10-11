import { hedStreamKey } from "./hed-indexer.service";
import type { HedDeployment } from "./hed.types";

const deployment: HedDeployment = {
  protocolKind: "HED", chainId: 31339, rpcUrl: "http://127.0.0.1:9548", tokenDecimals: 6, confirmations: 1, abiVersion: "1",
  contractAddress: "0x0000000000000000000000000000000000000001", tokenAddress: "0x0000000000000000000000000000000000000002",
  resolver: "0x0000000000000000000000000000000000000003", backupResolver: "0x0000000000000000000000000000000000000004",
  policyHash: `0x${"1".repeat(64)}`, genesisHash: `0x${"2".repeat(64)}`, contractCodeHash: `0x${"3".repeat(64)}`,
  tokenCodeHash: `0x${"4".repeat(64)}`, deploymentBlockNumber: "2", deploymentBlockHash: `0x${"5".repeat(64)}`, abiHash: `0x${"6".repeat(64)}`,
};

describe("hedStreamKey", () => {
  it("binds a projection stream to HED chain, contract and canonical deployment anchor", () => {
    expect(hedStreamKey(deployment)).toContain("HED:31339:0x0000000000000000000000000000000000000001");
    expect(hedStreamKey({ ...deployment, deploymentBlockHash: `0x${"7".repeat(64)}` })).not.toBe(hedStreamKey(deployment));
  });
});
