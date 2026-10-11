pragma solidity 0.8.24;

import { Script } from "forge-std/Script.sol";
import { FundTogetherDisbursement } from "../src/FundTogetherDisbursement.sol";

/// @dev Local HED deployment only. It reads no private key unless `forge script --broadcast` is explicitly used.
contract DeployHedMvp is Script {
    function run() external returns (FundTogetherDisbursement deployment) {
        address token = vm.envAddress("HED_TOKEN_ADDRESS");
        address resolver = vm.envAddress("HED_RESOLVER_ADDRESS");
        address backupResolver = vm.envAddress("HED_BACKUP_RESOLVER_ADDRESS");
        bytes32 policyHash = vm.envBytes32("HED_POLICY_HASH");
        vm.startBroadcast();
        deployment = new FundTogetherDisbursement(token, resolver, backupResolver, policyHash);
        vm.stopBroadcast();
    }
}
