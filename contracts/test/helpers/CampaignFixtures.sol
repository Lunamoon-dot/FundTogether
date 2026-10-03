pragma solidity 0.8.24;

import { FundTogether } from "../../src/FundTogether.sol";
import { Vm } from "forge-std/Vm.sol";

library CampaignFixtures {
    function configureCriteria(FundTogether fundTogether, uint256 campaignId) internal {
        (,,,, address organizer,,,) = fundTogether.campaigns(campaignId);
        Vm vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
        uint256 count = fundTogether.milestoneCount(campaignId);
        for (uint256 i; i < count; ++i) {
            vm.prank(organizer);
            fundTogether.configureMilestoneCriteria(
                campaignId, i, keccak256("Test acceptance criteria")
            );
        }
    }

    function equalBudgets(uint256 count, uint256 budget)
        internal
        pure
        returns (uint256[] memory budgets)
    {
        budgets = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            budgets[i] = budget;
        }
    }
}
