// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script } from "forge-std/Script.sol";
import { CampaignEscrowVNext } from "../src/campaigns/CampaignEscrowVNext.sol";
import { MockUSDC } from "../test/mocks/MockUSDC.sol";
import { MockRandomness } from "../src/jury/MockRandomness.sol";
import { JuryRegistry } from "../src/jury/JuryRegistry.sol";
import { JuryReview } from "../src/jury/JuryReview.sol";

/// @notice Local deployment wiring for the pure-decentralized VNext contracts.
/// @dev The two one-time configuration calls solve the escrow/review address
/// cycle. They are deployment wiring only; both boundaries lock permanently.
contract DeployVNext is Script {
    uint256 private constant PROTOCOL_VERSION = 1;
    uint256 private constant MAX_ELIGIBLE_JUDGES = 300;
    uint256 private constant APPEAL_BOND = 1e6;
    uint256 private constant MAX_APPEAL_ROUNDS = 2;
    uint256 private constant MINORITY_SLASH_BPS = 500;
    bytes32 private constant POLICY_HASH = keccak256("fundtogether-vnext-local-v2-remediation");

    function run()
        external
        returns (JuryRegistry registry, JuryReview review, CampaignEscrowVNext escrow)
    {
        uint256 deployerKey = vm.envUint("VNEXT_DEPLOYER_PRIVATE_KEY");
        address token = vm.envOr("VNEXT_TOKEN", address(0));
        address randomness = vm.envOr("VNEXT_RANDOMNESS", address(0));

        vm.startBroadcast(deployerKey);
        if (token == address(0)) token = address(new MockUSDC());
        if (randomness == address(0)) randomness = address(new MockRandomness());
        registry = new JuryRegistry(token, address(0));
        review = new JuryReview(
            address(registry),
            address(0),
            randomness,
            48 hours,
            24 hours,
            24 hours,
            48 hours,
            PROTOCOL_VERSION,
            MAX_ELIGIBLE_JUDGES,
            APPEAL_BOND,
            MAX_APPEAL_ROUNDS,
            MINORITY_SLASH_BPS
        );
        escrow = new CampaignEscrowVNext(
            token, address(review), PROTOCOL_VERSION, POLICY_HASH, 7 days, 7 days, 7 days
        );
        registry.configureReviewController(address(review));
        review.configureCampaignEscrow(address(escrow));
        vm.stopBroadcast();
    }
}
