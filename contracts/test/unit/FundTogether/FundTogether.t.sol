pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";

contract FundTogetherTest {
    function testCreateCampaignStoresConfiguration() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 100, 50, block.timestamp + 7 days
        );

        (
            string memory name,
            address campaignToken,
            uint256 goal,
            uint256 requiredBond,
            address organizer,
            bool bondLocked,
            uint256 bondAmount,
            uint256 totalRaised
        ) = fundTogether.campaigns(campaignId);
        require(keccak256(bytes(name)) == keccak256(bytes("Clean water")), "name mismatch");
        require(campaignToken == address(token), "token mismatch");
        require(goal == 100, "goal mismatch");
        require(requiredBond == 50, "bond mismatch");
        require(organizer == address(this), "organizer mismatch");
        require(!bondLocked, "bond should start unlocked");
        require(bondAmount == 0, "bond amount should start at zero");
        require(totalRaised == 0, "raised should start at zero");
    }

    function testDonateIncreasesTotalRaised() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 100, 50, block.timestamp + 7 days
        );
        token.mint(address(this), 75);
        token.approve(address(fundTogether), 75);
        fundTogether.lockBond(campaignId);
        fundTogether.approveCampaign(campaignId);
        fundTogether.publishCampaign(campaignId);

        fundTogether.donate(campaignId, 25);

        (,,,,,,, uint256 totalRaised) = fundTogether.campaigns(campaignId);
        require(totalRaised == 25, "raised mismatch");
    }

    function testZeroDonationReverts() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 100, 50, block.timestamp + 7 days
        );
        token.mint(address(this), 50);
        token.approve(address(fundTogether), 50);
        fundTogether.lockBond(campaignId);
        fundTogether.approveCampaign(campaignId);
        fundTogether.publishCampaign(campaignId);

        try fundTogether.donate(campaignId, 0) {
            revert("zero donation did not revert");
        } catch { }
    }

    function testUnknownCampaignReverts() public {
        FundTogether fundTogether = new FundTogether();

        try fundTogether.donate(999, 25) {
            revert("unknown campaign did not revert");
        } catch { }
    }
}
