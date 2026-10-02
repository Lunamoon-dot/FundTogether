pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { Test } from "forge-std/Test.sol";

contract BondCaller {
    function lock(FundTogether fundTogether, uint256 campaignId) external {
        fundTogether.lockBond(campaignId);
    }
}

contract FundTogetherBondTest is Test {
    event BondLocked(uint256 indexed campaignId, address indexed organizer, uint256 amount);

    function testCampaignStoresOrganizerAndRequiredBond() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );

        (
            ,
            address campaignToken,
            uint256 goal,
            uint256 requiredBond,
            address organizer,
            bool bondLocked,,
        ) = fundTogether.campaigns(campaignId);
        require(campaignToken == address(token), "token mismatch");
        require(goal == 1_000_000, "goal mismatch");
        require(requiredBond == 500_000, "bond mismatch");
        require(organizer == address(this), "organizer mismatch");
        require(!bondLocked, "bond should start unlocked");
    }

    function testOrganizerCanLockBond() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
        token.mint(address(this), 500_000);
        token.approve(address(fundTogether), 500_000);

        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit BondLocked(campaignId, address(this), 500_000);
        fundTogether.lockBond(campaignId);

        (,,,,, bool bondLocked, uint256 bondAmount,) = fundTogether.campaigns(campaignId);
        require(bondLocked, "bond should be locked");
        require(bondAmount == 500_000, "locked bond mismatch");
        require(token.balanceOf(address(this)) == 0, "organizer balance mismatch");
        require(token.balanceOf(address(fundTogether)) == 500_000, "bond custody mismatch");
    }

    function testNonOrganizerCannotLockBond() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
        BondCaller caller = new BondCaller();

        try caller.lock(fundTogether, campaignId) {
            revert("non-organizer locked bond");
        } catch { }
    }

    function testLockBondWithoutAllowanceReverts() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
        token.mint(address(this), 500_000);

        try fundTogether.lockBond(campaignId) {
            revert("missing allowance did not revert");
        } catch { }

        (,,,,, bool bondLocked, uint256 bondAmount,) = fundTogether.campaigns(campaignId);
        require(!bondLocked, "bond changed after revert");
        require(bondAmount == 0, "bond amount changed after revert");
    }

    function testBondCannotBeLockedTwice() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
        token.mint(address(this), 1_000_000);
        token.approve(address(fundTogether), 1_000_000);
        fundTogether.lockBond(campaignId);

        try fundTogether.lockBond(campaignId) {
            revert("bond locked twice");
        } catch { }
        require(token.balanceOf(address(fundTogether)) == 500_000, "bond custody changed");
    }

    function testBondAndDonationAccountingStaySeparate() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
        token.mint(address(this), 750_000);
        token.approve(address(fundTogether), 750_000);

        fundTogether.lockBond(campaignId);
        fundTogether.approveCampaign(campaignId);
        fundTogether.publishCampaign(campaignId);
        fundTogether.donate(campaignId, 250_000);

        (,,,,, bool bondLocked, uint256 bondAmount, uint256 totalContributed) =
            fundTogether.campaigns(campaignId);
        require(bondLocked, "bond should remain locked");
        require(bondAmount == 500_000, "bond accounting mismatch");
        require(totalContributed == 250_000, "donation accounting mismatch");
        require(token.balanceOf(address(fundTogether)) == 750_000, "total custody mismatch");
    }
}
